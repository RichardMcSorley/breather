import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { subDays } from "date-fns";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    
    // Calculate date range
    const endDate = new Date();
    endDate.setUTCHours(23, 59, 59, 999);
    const startDate = subDays(endDate, days);
    startDate.setUTCHours(0, 0, 0, 0);

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

    return NextResponse.json({
      byDayOfWeek: byDayOfWeekAvg,
      byHour: byHourAvg,
      byDayAndHour: byDayAndHourAvg,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

