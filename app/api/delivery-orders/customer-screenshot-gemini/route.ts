import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import OcrExport from "@/lib/models/OcrExport";
import { processOrderScreenshotGemini } from "@/lib/order-ocr-processor-gemini";
import { handleApiError } from "@/lib/api-error-handler";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { randomBytes } from "crypto";
import { attemptAutoLinkCustomerToTransaction } from "@/lib/auto-link-helper";

/**
 * API endpoint for processing customer screenshots with Gemini
 * Creates/updates customer entry and links to active transaction
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName, lat, lon, alt, address } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!screenshot) {
      return NextResponse.json(
        { error: "Missing screenshot" },
        { status: 400 }
      );
    }

    if (!appName) {
      return NextResponse.json(
        { error: "Missing appName" },
        { status: 400 }
      );
    }

    // Process screenshot to extract customer information using Gemini API
    let rawResponse: string;
    let metadata: Record<string, any> = {};

    try {
      const processed = await processOrderScreenshotGemini(screenshot, undefined, "customer");
      rawResponse = processed.rawResponse;
      metadata = processed.metadata;
    } catch (processError) {
      console.error("Error processing customer screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }

    // Find the active transaction for this user and appName
    const trimmedAppName = appName.trim();
    const activeTransaction = await Transaction.findOne({
      userId,
      active: true,
      type: "income",
      ...(trimmedAppName && { tag: { $regex: new RegExp(`^${trimmedAppName}$`, "i") } }),
    }).sort({ date: -1, createdAt: -1 });

    if (!activeTransaction) {
      return NextResponse.json(
        { error: "No active transaction found for this app" },
        { status: 404 }
      );
    }

    // Extract customer data from metadata
    const customerData = metadata.extractedData || {};
    const customerName = customerData.customerName?.trim();
    const customerAddress = customerData.deliveryAddress?.trim();

    if (!customerName || !customerAddress) {
      return NextResponse.json(
        { error: "Missing customer name or address in extracted data" },
        { status: 400 }
      );
    }

    // Get current EST time and convert to UTC
    const { date: processedAtDate } = getCurrentESTAsUTC();

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Create the customer entry (OcrExport)
    const exportEntry = await OcrExport.create({
      entryId,
      userId,
      appName: trimmedAppName || undefined,
      customerName,
      customerAddress,
      lat: null,
      lon: null,
      geocodeDisplayName: null,
      processedAt: processedAtDate,
      rawResponse: rawResponse || JSON.stringify(customerData),
      metadata: {
        extractedData: customerData,
      },
      ...(lat !== undefined && lat !== null && { userLatitude: lat }),
      ...(lon !== undefined && lon !== null && { userLongitude: lon }),
      ...(alt !== undefined && alt !== null && { userAltitude: alt }),
      ...(address !== undefined && address !== null && { userAddress: address }),
    });

    // Link customer to the active transaction
    try {
      // First try auto-linking
      await attemptAutoLinkCustomerToTransaction(exportEntry, userId);
      
      // Also manually link to ensure connection
      await Transaction.findByIdAndUpdate(
        activeTransaction._id,
        { $addToSet: { linkedOcrExportIds: exportEntry._id } },
        { new: true }
      );
      
      await OcrExport.findByIdAndUpdate(
        exportEntry._id,
        { $addToSet: { linkedTransactionIds: activeTransaction._id } },
        { new: true }
      );
    } catch (linkError) {
      console.error("Error linking customer to transaction:", linkError);
      // Don't fail the request if linking fails
    }

    return NextResponse.json({
      success: true,
      id: exportEntry._id.toString(),
      entryId: exportEntry.entryId,
      transactionId: activeTransaction._id.toString(),
      message: "Customer information created and linked successfully",
      customer: {
        customerName,
        deliveryAddress: customerAddress,
        deliveryInstructions: customerData.deliveryInstructions,
        deliveryType: customerData.deliveryType,
        requiresDeliveryPIN: customerData.requiresDeliveryPIN,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

