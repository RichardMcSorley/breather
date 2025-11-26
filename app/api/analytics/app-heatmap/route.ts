import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC } from "@/lib/date-utils";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const localDateStr = searchParams.get("localDate");
    const viewMode = searchParams.get("viewMode") || "day";
    
    // Calculate date range based on viewMode and localDate
    let startDate: Date;
    let endDate: Date;
    
    if (localDateStr) {
      const selectedDate = parseDateOnlyAsUTC(localDateStr);
      
      if (viewMode === "year") {
        const year = selectedDate.getUTCFullYear();
        startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      } else if (viewMode === "month") {
        const year = selectedDate.getUTCFullYear();
        const month = selectedDate.getUTCMonth();
        startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
      } else {
        // Day view: use that month's data
        const year = selectedDate.getUTCFullYear();
        const month = selectedDate.getUTCMonth();
        startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
      }
    } else {
      // Default: current month
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
    }

    // Get all income transactions in the date range
    const transactions = await Transaction.find({
      userId: session.user.id,
      type: "income",
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).lean();

    // Initialize data structure: app (tag) -> day of week -> total earnings
    const appDayData: Record<string, Record<string, number>> = {};
    const allApps = new Set<string>();

    // Process transactions
    transactions.forEach((transaction) => {
      const tag = transaction.tag || "Other";
      const date = new Date(transaction.date);
      const dayOfWeek = date.getUTCDay().toString(); // 0 = Sunday, 6 = Saturday

      if (!appDayData[tag]) {
        appDayData[tag] = {
          "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0,
        };
      }

      appDayData[tag][dayOfWeek] = (appDayData[tag][dayOfWeek] || 0) + transaction.amount;
      allApps.add(tag);
    });

    // Convert to array format for easier rendering
    const apps = Array.from(allApps).sort();
    
    // Calculate averages per app per day
    const appDayAverages: Record<string, Record<string, number>> = {};
    apps.forEach((app) => {
      appDayAverages[app] = {};
      for (let day = 0; day < 7; day++) {
        const dayKey = day.toString();
        appDayAverages[app][dayKey] = appDayData[app]?.[dayKey] || 0;
      }
    });

    return NextResponse.json({
      apps,
      data: appDayAverages,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

