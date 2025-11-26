"use client";

import Card from "./ui/Card";
import { useHeatMapData } from "@/hooks/useQueries";

interface HeatMapData {
  byDayOfWeek: Record<string, number>;
  byHour: Record<string, number>;
  byDayAndHour: Record<string, Record<string, number>>;
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

interface HeatMapProps {
  days?: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HeatMap({ days = 30 }: HeatMapProps) {
  const { data, isLoading: loading } = useHeatMapData(days);

  const getMaxValue = () => {
    if (!data) return 1;
    let max = 0;
    Object.values(data.byDayAndHour).forEach((dayData) => {
      const typedDayData = dayData as Record<string, number>;
      Object.values(typedDayData).forEach((value: number) => {
        if (value > max) max = value;
      });
    });
    return max || 1;
  };

  const getColorIntensity = (value: number, maxValue: number) => {
    if (value === 0) return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-900 dark:text-white" };
    const intensity = value / maxValue;
    if (intensity >= 0.8) return { bg: "bg-green-600 dark:bg-green-700", text: "text-white dark:text-white" };
    if (intensity >= 0.6) return { bg: "bg-green-500 dark:bg-green-600", text: "text-white dark:text-white" };
    if (intensity >= 0.4) return { bg: "bg-green-400 dark:bg-green-500", text: "text-black dark:text-white" };
    if (intensity >= 0.2) return { bg: "bg-green-300 dark:bg-green-400", text: "text-black dark:text-black" };
    return { bg: "bg-green-200 dark:bg-green-300", text: "text-black dark:text-black" };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No data available for heat map
        </div>
      </Card>
    );
  }

  const maxValue = getMaxValue();

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Earnings Heat Map
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Average earnings by day of week and hour (last {days} days)
        </p>
      </div>

      {/* Day of Week Summary */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Average Earnings by Day of Week
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {DAY_NAMES.map((dayName, index) => {
            const dayKey = index.toString();
            const value = data.byDayOfWeek[dayKey] || 0;
            const colors = getColorIntensity(value, maxValue);
            return (
              <div key={dayKey} className="text-center">
                <div
                  className={`${colors.bg} rounded p-2 mb-1 min-h-[60px] flex items-center justify-center`}
                  title={`${dayName}: ${formatCurrency(value)}`}
                >
                  <span className={`text-xs font-medium ${colors.text}`}>
                    {formatCurrency(value)}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{dayName}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hour of Day Summary */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Average Earnings by Hour of Day
        </h3>
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 24 }, (_, hour) => {
            const hourKey = hour.toString();
            const value = data.byHour[hourKey] || 0;
            const colors = getColorIntensity(value, maxValue);
            return (
              <div key={hourKey} className="text-center">
                <div
                  className={`${colors.bg} rounded p-1 mb-1 min-h-[40px] flex items-center justify-center`}
                  title={`${hour}:00 - ${formatCurrency(value)}`}
                >
                  <span className={`text-[10px] font-medium ${colors.text}`}>
                    {formatCurrency(value)}
                  </span>
                </div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400">{hour}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Lower earnings</span>
          <div className="flex gap-1">
            <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 rounded"></div>
            <div className="w-4 h-4 bg-green-200 dark:bg-green-300 rounded"></div>
            <div className="w-4 h-4 bg-green-400 dark:bg-green-500 rounded"></div>
            <div className="w-4 h-4 bg-green-500 dark:bg-green-600 rounded"></div>
            <div className="w-4 h-4 bg-green-600 dark:bg-green-700 rounded"></div>
          </div>
          <span>Higher earnings</span>
        </div>
      </div>
    </Card>
  );
}

