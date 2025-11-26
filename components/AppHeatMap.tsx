"use client";

import Card from "./ui/Card";
import { useAppHeatMapData } from "@/hooks/useQueries";

interface AppHeatMapData {
  apps: string[];
  data: Record<string, Record<string, number>>;
  period: {
    startDate: string;
    endDate: string;
  };
}

interface AppHeatMapProps {
  localDate: string;
  viewMode: "day" | "month" | "year";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AppHeatMap({ localDate, viewMode }: AppHeatMapProps) {
  const { data, isLoading: loading } = useAppHeatMapData(localDate, viewMode);

  const getMaxValue = () => {
    if (!data) return 1;
    let max = 0;
    data.apps.forEach((app) => {
      for (let day = 0; day < 7; day++) {
        const value = data.data[app]?.[day.toString()] || 0;
        if (value > max) max = value;
      }
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

  if (!data || !data.apps || data.apps.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No app data available for heat map
        </div>
      </Card>
    );
  }

  const maxValue = getMaxValue();

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          App Performance by Day
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Earnings by app and day of week
          {viewMode === "year" && " (this year)"}
          {viewMode === "month" && " (this month)"}
          {viewMode === "day" && " (this month)"}
        </p>
      </div>

      {/* Heat Map Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-gray-400 pb-2 pr-4">
                  App
                </th>
                {DAY_NAMES.map((dayName, index) => (
                  <th
                    key={index}
                    className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 pb-2 px-1"
                  >
                    {dayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.apps.map((app) => (
                <tr key={app}>
                  <td className="text-sm font-medium text-gray-700 dark:text-gray-300 pr-4 py-1">
                    {app}
                  </td>
                  {DAY_NAMES.map((_, dayIndex) => {
                    const dayKey = dayIndex.toString();
                    const value = data.data[app]?.[dayKey] || 0;
                    const colors = getColorIntensity(value, maxValue);
                    return (
                      <td key={dayIndex} className="px-1 py-1">
                        <div
                          className={`${colors.bg} rounded p-2 min-h-[40px] flex items-center justify-center`}
                          title={`${app} on ${DAY_NAMES[dayIndex]}: ${formatCurrency(value)}`}
                        >
                          <span className={`text-xs font-medium ${colors.text}`}>
                            {value > 0 ? formatCurrency(value) : "-"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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

