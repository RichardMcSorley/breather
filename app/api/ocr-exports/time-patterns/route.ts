import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { getDayOfWeekName, getHourBucketName } from "@/lib/ocr-analytics";

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

    // Activity by day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeekCounts: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      dayOfWeekCounts[i] = 0;
    }
    entries.forEach((entry) => {
      const date = new Date(entry.processedAt || entry.createdAt);
      const dayOfWeek = date.getUTCDay();
      dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
    });

    const dayOfWeekData = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      dayName: getDayOfWeekName(i),
      count: dayOfWeekCounts[i] || 0,
    }));

    // Activity by time of day (hour buckets)
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }
    entries.forEach((entry) => {
      const date = new Date(entry.processedAt || entry.createdAt);
      const hour = date.getUTCHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const timeOfDayData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourBucket: getHourBucketName(i),
      count: hourCounts[i] || 0,
    }));

    // Trends over time - weekly aggregation
    const weeklyData: Record<string, number> = {};
    entries.forEach((entry) => {
      const date = new Date(entry.processedAt || entry.createdAt);
      // Get ISO week (YYYY-WW format)
      const year = date.getUTCFullYear();
      const week = getWeekNumber(date);
      const weekKey = `${year}-W${week.toString().padStart(2, "0")}`;
      weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
    });

    const weeklyTrends = Object.entries(weeklyData)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Trends over time - monthly aggregation
    const monthlyData: Record<string, number> = {};
    entries.forEach((entry) => {
      const date = new Date(entry.processedAt || entry.createdAt);
      const monthKey = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
    });

    const monthlyTrends = Object.entries(monthlyData)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      dayOfWeek: dayOfWeekData,
      timeOfDay: timeOfDayData,
      trends: {
        weekly: weeklyTrends,
        monthly: monthlyTrends,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

