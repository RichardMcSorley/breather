/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { processOcrScreenshot } from "@/lib/ocr-processor";
import { geocodeAddress } from "@/lib/geocode-helper";
import { isSameAddress } from "@/lib/ocr-analytics";
import { randomBytes } from "crypto";
import { attemptAutoLinkCustomerToTransaction, attemptAutoLinkCustomerToActiveOrders } from "@/lib/auto-link-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName, ocrText, lat: userLat, lon: userLon, alt: userAlt, address: userAddr } = body;

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

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Process screenshot immediately with Moondream
    try {
      const processed = await processOcrScreenshot(screenshot, ocrText);

      // Check for existing geocode data with exact address match
      let geocodeData: { lat: number; lon: number; displayName?: string } | null = null;
      const existingEntry = await OcrExport.findOne({
        customerAddress: processed.customerAddress,
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
        geocodeData = await geocodeAddress(processed.customerAddress);
      }

      // Get current EST time and convert to UTC (matches transaction log timezone logic)
      const { date: processedAtDate } = getCurrentESTAsUTC();

      // Save to ocrexports collection
      const exportEntry = await OcrExport.create({
        entryId,
        userId,
        appName: appName || undefined,
        customerName: processed.customerName,
        customerAddress: processed.customerAddress,
        rawResponse: processed.rawResponse,
        metadata: processed.metadata,
        lat: geocodeData?.lat,
        lon: geocodeData?.lon,
        geocodeDisplayName: geocodeData?.displayName,
        processedAt: processedAtDate,
        ...(userLat !== undefined && userLat !== null && { userLatitude: userLat }),
        ...(userLon !== undefined && userLon !== null && { userLongitude: userLon }),
        ...(userAlt !== undefined && userAlt !== null && { userAltitude: userAlt }),
        ...(userAddr !== undefined && userAddr !== null && { userAddress: userAddr }),
      });

      // Attempt auto-linking to matching transaction
      try {
        await attemptAutoLinkCustomerToTransaction(exportEntry, userId);
      } catch (autoLinkError) {
        // Silently fail auto-linking - don't break customer creation
        console.error("Auto-linking error:", autoLinkError);
      }

      // Attempt auto-linking to active orders
      try {
        const linkedOrderIds = await attemptAutoLinkCustomerToActiveOrders(exportEntry, userId);
        if (linkedOrderIds.length > 0) {
          console.log(`Successfully auto-linked customer ${exportEntry._id} to ${linkedOrderIds.length} active order(s):`, linkedOrderIds);
        } else {
          console.log(`No active orders found to link for customer ${exportEntry._id} (appName: ${exportEntry.appName || 'none'})`);
        }
      } catch (autoLinkOrdersError) {
        // Log error but don't break customer creation
        console.error("Auto-linking to active orders error:", autoLinkOrdersError);
      }

      // Check for repeat customers by address (address is the unique identifier)
      const allUserEntries = await OcrExport.find({ userId }).lean();
      const matchingEntries = allUserEntries.filter((entry) =>
        isSameAddress(entry.customerAddress, processed.customerAddress)
      );
      const visitCount = matchingEntries.length;
      const isRepeatCustomer = visitCount > 1;

      // Get all unique customer names for this address
      const customerNames = Array.from(
        new Set(matchingEntries.map((entry) => entry.customerName).filter(Boolean))
      );

      const encodedAddress = encodeURIComponent(processed.customerAddress);
      // Build response
      const response: any = {
        success: true,
        id: exportEntry._id.toString(),
        entryId: exportEntry.entryId,
        message: "OCR screenshot processed and saved successfully",
        isRepeatCustomer,
        visitCount,
        customerNames,
        viewLink: `https://breather-chi.vercel.app/ocr-data?address=${encodedAddress}`,
        editLink: `https://breather-chi.vercel.app/ocr-data?entryId=${exportEntry._id.toString()}&address=${encodedAddress}`,
      };

      return NextResponse.json(response);
    } catch (processError) {
      console.error("Error processing OCR screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

