"use client";

import { useState, useEffect } from "react";
import Card from "./ui/Card";
import Input from "./ui/Input";

interface AnalyticsData {
  statistics: {
    totalCustomers: number;
    uniqueAddresses: number;
    totalVisits: number;
    mostActiveDay: {
      day: number;
      dayName: string;
      count: number;
    };
    mostActiveApp: {
      app: string;
      count: number;
    };
  };
  breakdowns: {
    dayOfWeek: Array<{
      day: number;
      dayName: string;
      count: number;
    }>;
    apps: Array<{
      app: string;
      count: number;
    }>;
  };
}

interface OcrAnalyticsProps {
  userId?: string;
}

export default function OcrAnalytics({ userId }: OcrAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchAnalytics();
  }, [userId, startDate, endDate]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await fetch(`/api/ocr-exports/analytics?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="date"
            label="Start Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            type="date"
            label="End Date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            Total Customers
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {data.statistics.totalCustomers}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            Unique Addresses
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {data.statistics.uniqueAddresses}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            Total Visits
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {data.statistics.totalVisits}
          </div>
        </Card>
      </div>

      {/* Most Active Day and App */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Most Active Day
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {data.statistics.mostActiveDay.dayName}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {data.statistics.mostActiveDay.count} {data.statistics.mostActiveDay.count === 1 ? "visit" : "visits"}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Most Active App
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {data.statistics.mostActiveApp.app}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {data.statistics.mostActiveApp.count} {data.statistics.mostActiveApp.count === 1 ? "visit" : "visits"}
          </div>
        </Card>
      </div>
    </div>
  );
}

