"use client";

import { useState, useEffect } from "react";
import Card from "./ui/Card";

interface DayOfWeekData {
  day: number;
  dayName: string;
  count: number;
}

interface TimeOfDayData {
  hour: number;
  hourBucket: string;
  count: number;
}

interface TrendData {
  week?: string;
  month?: string;
  count: number;
}

interface TimePatternsData {
  dayOfWeek: DayOfWeekData[];
  timeOfDay: TimeOfDayData[];
  trends: {
    weekly: TrendData[];
    monthly: TrendData[];
  };
}

interface TimePatternsChartProps {
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export default function TimePatternsChart({
  userId,
  startDate,
  endDate,
}: TimePatternsChartProps) {
  const [data, setData] = useState<TimePatternsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    fetchTimePatterns();
  }, [userId, startDate, endDate]);

  const fetchTimePatterns = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await fetch(`/api/ocr-exports/time-patterns?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch time patterns");
      }

      const patternsData = await response.json();
      setData(patternsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getMaxCount = (items: Array<{ count: number }>) => {
    return Math.max(...items.map((item) => item.count), 1);
  };

  if (loading && !data) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const maxDayCount = getMaxCount(data.dayOfWeek);
  const maxHourCount = getMaxCount(data.timeOfDay);
  const maxTrendCount = getMaxCount(
    trendView === "weekly" ? data.trends.weekly : data.trends.monthly
  );

  return (
    <div className="space-y-6">
      {/* Day of Week Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Activity by Day of Week
        </h3>
        <div className="space-y-3">
          {data.dayOfWeek.map((day) => {
            const percentage = (day.count / maxDayCount) * 100;
            return (
              <div key={day.day} className="flex items-center gap-4">
                <div className="w-24 text-sm text-gray-700 dark:text-gray-300">
                  {day.dayName}
                </div>
                <div className="flex-1">
                  <div className="relative h-8 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-green-500 dark:bg-green-600 transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900 dark:text-white">
                      {day.count > 0 && day.count}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Time of Day Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Activity by Time of Day
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {data.timeOfDay.map((hour) => {
            const percentage = (hour.count / maxHourCount) * 100;
            return (
              <div key={hour.hour} className="text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {hour.hour}:00
                </div>
                <div className="relative h-32 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 transition-all duration-300"
                    style={{ height: `${percentage}%` }}
                  />
                  <div className="absolute inset-0 flex items-end justify-center pb-1">
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      {hour.count > 0 && hour.count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Trends Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Trends Over Time
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTrendView("weekly")}
              className={`px-3 py-1 text-sm rounded ${
                trendView === "weekly"
                  ? "bg-green-600 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setTrendView("monthly")}
              className={`px-3 py-1 text-sm rounded ${
                trendView === "monthly"
                  ? "bg-green-600 text-white"
                  : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {(trendView === "weekly" ? data.trends.weekly : data.trends.monthly).map(
            (trend, index) => {
              const percentage = (trend.count / maxTrendCount) * 100;
              const label = trendView === "weekly" ? trend.week : trend.month;
              return (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-700 dark:text-gray-300">
                    {label}
                  </div>
                  <div className="flex-1">
                    <div className="relative h-8 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-purple-500 dark:bg-purple-600 transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900 dark:text-white">
                        {trend.count > 0 && trend.count}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      </Card>
    </div>
  );
}

