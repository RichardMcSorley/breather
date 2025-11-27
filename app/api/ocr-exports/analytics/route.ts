import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { getDayOfWeekName } from "@/lib/ocr-analytics";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Build query
    const query: Record<string, any> = {};
    if (userId) {
      query.userId = userId;
    }

    // Add date range filter if provided
    if (startDateParam || endDateParam) {
      query.processedAt = {};
      if (startDateParam) {
        query.processedAt.$gte = new Date(startDateParam);
      }
      if (endDateParam) {
        query.processedAt.$lte = new Date(endDateParam);
      }
    }

    // Get all matching entries
    const entries = await OcrExport.find(query).lean();

    // Calculate statistics
    const totalVisits = entries.length;
    
    // Unique customer names (case-insensitive)
    const uniqueCustomerNames = new Set<string>();
    entries.forEach((entry) => {
      if (entry.customerName) {
        uniqueCustomerNames.add(entry.customerName.toLowerCase().trim());
      }
    });
    const totalCustomers = uniqueCustomerNames.size;

    // Unique addresses
    const uniqueAddresses = new Set<string>();
    entries.forEach((entry) => {
      if (entry.customerAddress) {
        uniqueAddresses.add(entry.customerAddress.toLowerCase().trim());
      }
    });
    const uniqueAddressesCount = uniqueAddresses.size;

    // Most active day of week
    const dayOfWeekCounts: Record<number, number> = {};
    entries.forEach((entry) => {
      const date = new Date(entry.processedAt || entry.createdAt);
      const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
      dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
    });
    
    let mostActiveDay = 0;
    let maxDayCount = 0;
    for (const [day, count] of Object.entries(dayOfWeekCounts)) {
      if (count > maxDayCount) {
        maxDayCount = count;
        mostActiveDay = parseInt(day);
      }
    }

    // Most active app
    const appCounts: Record<string, number> = {};
    entries.forEach((entry) => {
      const appName = entry.appName || "Unknown";
      appCounts[appName] = (appCounts[appName] || 0) + 1;
    });
    
    let mostActiveApp = "Unknown";
    let maxAppCount = 0;
    for (const [app, count] of Object.entries(appCounts)) {
      if (count > maxAppCount) {
        maxAppCount = count;
        mostActiveApp = app;
      }
    }

    // Day of week breakdown
    const dayOfWeekBreakdown = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      dayName: getDayOfWeekName(i),
      count: dayOfWeekCounts[i] || 0,
    }));

    // App breakdown
    const appBreakdown = Object.entries(appCounts)
      .map(([app, count]) => ({ app, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      statistics: {
        totalCustomers,
        uniqueAddresses: uniqueAddressesCount,
        totalVisits,
        mostActiveDay: {
          day: mostActiveDay,
          dayName: getDayOfWeekName(mostActiveDay),
          count: maxDayCount,
        },
        mostActiveApp: {
          app: mostActiveApp,
          count: maxAppCount,
        },
      },
      breakdowns: {
        dayOfWeek: dayOfWeekBreakdown,
        apps: appBreakdown,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

