import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { geocodeAddress } from "@/lib/geocode-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";
import { randomBytes } from "crypto";
import { isValidObjectId } from "@/lib/validation";
import { attemptAutoLinkCustomerToTransaction } from "@/lib/auto-link-helper";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { userId, customerName, customerAddress, appName, transactionId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Ensure userId matches session
    if (userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!customerName || customerName.trim() === "") {
      return NextResponse.json({ error: "Missing customerName" }, { status: 400 });
    }

    if (!customerAddress || customerAddress.trim() === "") {
      return NextResponse.json({ error: "Missing customerAddress" }, { status: 400 });
    }

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Try to geocode the address
    let geocodeData: { lat: number; lon: number; displayName?: string } | null = null;
    let geocodeFailed = false;
    
    try {
      // Check for existing geocode data with exact address match
      const existingEntry = await OcrExport.findOne({
        customerAddress: customerAddress.trim(),
        lat: { $exists: true, $ne: null },
        lon: { $exists: true, $ne: null },
      }).lean();

      if (existingEntry && existingEntry.lat != null && existingEntry.lon != null) {
        geocodeData = {
          lat: existingEntry.lat,
          lon: existingEntry.lon,
          displayName: existingEntry.geocodeDisplayName,
        };
      } else {
        // If not found in cache, geocode the address
        geocodeData = await geocodeAddress(customerAddress.trim());
        if (!geocodeData) {
          geocodeFailed = true;
        }
      }
    } catch (geocodeError) {
      // If geocoding fails, still create the customer entry
      console.error("Geocoding error for customer entry:", geocodeError);
      geocodeFailed = true;
      geocodeData = null;
    }

    // Get current EST time and convert to UTC
    const { date: processedAtDate } = getCurrentESTAsUTC();

    // Create the OCR export entry
    const exportEntry = await OcrExport.create({
      entryId,
      userId,
      appName: appName?.trim() || undefined,
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      lat: geocodeData?.lat ?? null,
      lon: geocodeData?.lon ?? null,
      geocodeDisplayName: geocodeFailed ? "unknown" : (geocodeData?.displayName ?? null),
      processedAt: processedAtDate,
      rawResponse: JSON.stringify({ customerName: customerName.trim(), customerAddress: customerAddress.trim() }),
      metadata: { manuallyCreated: true },
    });

    // If transactionId is provided, link the customer to the transaction
    if (transactionId && isValidObjectId(transactionId)) {
      try {
        // First try auto-linking
        await attemptAutoLinkCustomerToTransaction(exportEntry, userId);
        
        // Also manually link if auto-linking didn't work
        const transaction = await Transaction.findById(transactionId);
        if (transaction && transaction.userId === userId) {
          await Transaction.findByIdAndUpdate(
            transactionId,
            { $addToSet: { linkedOcrExportIds: exportEntry._id } },
            { new: true }
          );
          
          await OcrExport.findByIdAndUpdate(
            exportEntry._id,
            { $addToSet: { linkedTransactionIds: transaction._id } },
            { new: true }
          );
        }
      } catch (linkError) {
        // Log error but don't fail customer creation
        console.error("Error linking customer to transaction:", linkError);
      }
    }

    return NextResponse.json({
      success: true,
      id: exportEntry._id.toString(),
      entryId: exportEntry.entryId,
      message: "Customer created successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

