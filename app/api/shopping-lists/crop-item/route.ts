import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import ShoppingListItemCroppedImage from "@/lib/models/ShoppingListItemCroppedImage";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

// Server-side image cropping using jimp (pure JS, no native modules)
async function cropImageServerSide(
  base64Image: string,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): Promise<string> {
  try {
    // Remove data URL prefix if present
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    // Use jimp for server-side image processing (pure JS, no native dependencies)
    const jimpModule = await import("jimp");
    // jimp exports Jimp class as Jimp.Jimp
    const JimpClass = (jimpModule as any).Jimp || (jimpModule as any).default?.Jimp || jimpModule;
    const buffer = Buffer.from(base64Data, "base64");
    
    // Load image - Jimp.read is a static method on the Jimp class
    const image = await JimpClass.read(buffer);
    // Jimp uses width/height properties, not getWidth()/getHeight() methods
    const width = image.width || image.bitmap?.width;
    const height = image.height || image.bitmap?.height;

    if (!width || !height) {
      throw new Error("Could not determine image dimensions");
    }

    // Convert normalized coordinates to pixel values
    const pixelXMin = Math.floor(xMin * width);
    const pixelYMin = Math.floor(yMin * height);
    const pixelXMax = Math.floor(xMax * width);
    const pixelYMax = Math.floor(yMax * height);

    const cropWidth = pixelXMax - pixelXMin;
    const cropHeight = pixelYMax - pixelYMin;

    // Crop the image - jimp crop() expects an object with x, y, w, h properties
    const croppedImage = image.crop({
      x: pixelXMin,
      y: pixelYMin,
      w: cropWidth,
      h: cropHeight,
    });
    
    // Convert to buffer as PNG - use getBuffer() method (not getBufferAsync)
    // JimpMime is an object with properties like .png, .jpeg, etc., or we can use the string directly
    const JimpMime = (jimpModule as any).JimpMime;
    const MIME_PNG = JimpMime?.png || "image/png";
    const croppedBuffer = await croppedImage.getBuffer(MIME_PNG);

    // Convert back to base64
    const croppedBase64 = `data:image/png;base64,${croppedBuffer.toString("base64")}`;
    return croppedBase64;
  } catch (error) {
    console.error("Error cropping image with jimp:", error);
    throw new Error(`Failed to crop image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { shoppingListId, itemIndex, screenshotBase64, productName } = body;

    if (!shoppingListId || itemIndex === undefined) {
      return NextResponse.json(
        { error: "Shopping list ID and item index are required" },
        { status: 400 }
      );
    }

    if (!screenshotBase64) {
      return NextResponse.json(
        { error: "Screenshot base64 is required" },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify user has access to this shopping list
    const shoppingList = await ShoppingList.findOne({
      _id: shoppingListId,
      $or: [
        { userId: session.user.id },
        { sharedWith: session.user.id },
      ],
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found or access denied" },
        { status: 404 }
      );
    }

    // Verify item exists
    if (itemIndex < 0 || itemIndex >= shoppingList.items.length) {
      return NextResponse.json(
        { error: "Invalid item index" },
        { status: 400 }
      );
    }

    // Initialize moondream model (dynamic import to avoid build issues)
    const apiKey = process.env.MOONDREAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Moondream API key not configured" },
        { status: 500 }
      );
    }

    // Dynamically import moondream to avoid build-time issues
    const moondreamModule = await import("moondream");
    const { vl } = moondreamModule;
    const model = new vl({ apiKey: apiKey });

    // Convert base64 to buffer for moondream
    const base64Data = screenshotBase64.includes(",")
      ? screenshotBase64.split(",")[1]
      : screenshotBase64;
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Log the product name being sent to moondream
    console.log("🔍 Sending to Moondream - Product Name:", productName);

    // Detect the product in the screenshot
    const result = await model.detect({
      image: imageBuffer,
      object: productName,
    });

    // Log the full API response
    console.log("Moondream API Response:", JSON.stringify(result, null, 2));
    console.log("Result objects:", result.objects);
    if ('request_id' in result) {
      console.log("Result request_id:", (result as any).request_id);
    }

    if (!result.objects || result.objects.length === 0) {
      console.log("No objects detected in screenshot");
      return NextResponse.json({
        success: false,
        message: "Product not detected in screenshot",
        croppedImage: null,
      });
    }

    // Use the first detection (most confident)
    const detection = result.objects[0];
    console.log("Using detection:", JSON.stringify(detection, null, 2));
    const { x_min, y_min, x_max, y_max } = detection;
    console.log("Bounding box coordinates:", { x_min, y_min, x_max, y_max });

    // Crop the image using the bounding box
    // For Kroger shopping, keep full width of screenshot but use moondream's height
    const croppedImage = await cropImageServerSide(
      screenshotBase64,
      0,      // x_min: full width start
      y_min,  // y_min: from moondream
      1,      // x_max: full width end
      y_max   // y_max: from moondream
    );

    // Save cropped image to separate collection with bounding box coordinates
    // Save the actual crop coordinates (full width) to match what was cropped
    const listId = shoppingList._id.toString();
    await ShoppingListItemCroppedImage.findOneAndUpdate(
      { shoppingListId: listId, itemIndex },
      {
        shoppingListId: listId,
        itemIndex,
        base64: croppedImage,
        uploadedAt: new Date(),
        // Save the actual crop coordinates (full width, moondream height) to match what was cropped
        xMin: 0,      // Full width start
        yMin: y_min,  // From moondream
        xMax: 1,      // Full width end
        yMax: y_max,  // From moondream
      },
      { upsert: true, new: true }
    );

    console.log("Cropped image saved to separate collection:", {
      shoppingListId: listId,
      itemIndex,
      productName: shoppingList.items[itemIndex].productName,
      croppedImageLength: croppedImage.length,
    });

    return NextResponse.json({
      success: true,
      croppedImage,
      detection: {
        x_min,
        y_min,
        x_max,
        y_max,
      },
    });
  } catch (error) {
    console.error("Error cropping item:", error);
    return handleApiError(error);
  }
}
