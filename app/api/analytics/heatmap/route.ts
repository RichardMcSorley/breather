import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
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
    const days = parseInt(searchParams.get("days") || "30");
    
    // Calculate date range based on viewMode and localDate
    let startDate: Date;
    let endDate: Date;
    
    if (localDateStr && viewMode !== "day") {
      // Parse user's local date
      const selectedDate = parseDateOnlyAsUTC(localDateStr);
      
      if (viewMode === "year") {
        // For year view, use the entire year
        const year = selectedDate.getUTCFullYear();
        startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      } else if (viewMode === "month") {
        // For month view, use the entire month
        const year = selectedDate.getUTCFullYear();
        const month = selectedDate.getUTCMonth();
        startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
      } else {
        // Fallback to days
        endDate = new Date();
        endDate.setUTCHours(23, 59, 59, 999);
        startDate = subDays(endDate, days);
        startDate.setUTCHours(0, 0, 0, 0);
      }
    } else if (localDateStr && viewMode === "day") {
      // For day view, use that month's data
      const selectedDate = parseDateOnlyAsUTC(localDateStr);
      const year = selectedDate.getUTCFullYear();
      const month = selectedDate.getUTCMonth();
      startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      endDate = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
    } else {
      // Default: last N days
      endDate = new Date();
      endDate.setUTCHours(23, 59, 59, 999);
      startDate = subDays(endDate, days);
      startDate.setUTCHours(0, 0, 0, 0);
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

    // Initialize data structures
    const byDayOfWeek: Record<string, { total: number; count: number }> = {
      "0": { total: 0, count: 0 }, // Sunday
      "1": { total: 0, count: 0 }, // Monday
      "2": { total: 0, count: 0 }, // Tuesday
      "3": { total: 0, count: 0 }, // Wednesday
      "4": { total: 0, count: 0 }, // Thursday
      "5": { total: 0, count: 0 }, // Friday
      "6": { total: 0, count: 0 }, // Saturday
    };

    const byHour: Record<string, { total: number; count: number }> = {};
    for (let i = 0; i < 24; i++) {
      byHour[i.toString()] = { total: 0, count: 0 };
    }

    const byDayAndHour: Record<string, Record<string, { total: number; count: number }>> = {};
    for (let day = 0; day < 7; day++) {
      byDayAndHour[day.toString()] = {};
      for (let hour = 0; hour < 24; hour++) {
        byDayAndHour[day.toString()][hour.toString()] = { total: 0, count: 0 };
      }
    }

    // Process transactions
    transactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const dayOfWeek = date.getUTCDay().toString();
      const hour = parseInt(transaction.time.split(":")[0] || "0").toString();

      // Update by day of week
      byDayOfWeek[dayOfWeek].total += transaction.amount;
      byDayOfWeek[dayOfWeek].count += 1;

      // Update by hour
      if (byHour[hour]) {
        byHour[hour].total += transaction.amount;
        byHour[hour].count += 1;
      }

      // Update by day and hour
      if (byDayAndHour[dayOfWeek] && byDayAndHour[dayOfWeek][hour]) {
        byDayAndHour[dayOfWeek][hour].total += transaction.amount;
        byDayAndHour[dayOfWeek][hour].count += 1;
      }
    });

    // Calculate averages
    const byDayOfWeekAvg: Record<string, number> = {};
    Object.keys(byDayOfWeek).forEach((day) => {
      const data = byDayOfWeek[day];
      byDayOfWeekAvg[day] = data.count > 0 ? data.total / data.count : 0;
    });

    const byHourAvg: Record<string, number> = {};
    Object.keys(byHour).forEach((hour) => {
      const data = byHour[hour];
      byHourAvg[hour] = data.count > 0 ? data.total / data.count : 0;
    });

    const byDayAndHourAvg: Record<string, Record<string, number>> = {};
    Object.keys(byDayAndHour).forEach((day) => {
      byDayAndHourAvg[day] = {};
      Object.keys(byDayAndHour[day]).forEach((hour) => {
        const data = byDayAndHour[day][hour];
        byDayAndHourAvg[day][hour] = data.count > 0 ? data.total / data.count : 0;
      });
    });

    // Calculate actual days in period
    // If no localDate/viewMode was provided, use the requested days parameter
    // Otherwise calculate actual days from the date range
    let periodDays: number;
    if (!localDateStr) {
      // Default case: use the requested days parameter
      periodDays = days;
    } else {
      // Calculate actual days from date range
      periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
    
    return NextResponse.json({
      byDayOfWeek: byDayOfWeekAvg,
      byHour: byHourAvg,
      byDayAndHour: byDayAndHourAvg,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days: periodDays,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

