"use client";

import { useState, useEffect, useMemo } from "react";
import Modal from "./ui/Modal";
import { format } from "date-fns";
import { getDayOfWeekName, getHourBucketName } from "@/lib/ocr-analytics";

interface Visit {
  _id: string;
  entryId: string;
  customerName: string;
  customerAddress: string;
  appName?: string;
  processedAt: string;
  createdAt: string;
  lat?: number;
  lon?: number;
  geocodeDisplayName?: string;
}

interface LinkedTransaction {
  _id: string;
  amount: number;
  date: string;
  time: string;
  tag?: string;
  notes?: string;
}

interface LinkedOrder {
  id: string;
  restaurantName: string;
  appName: string;
  miles: number;
  money: number;
  milesToMoneyRatio: number;
  time: string;
  processedAt: string;
}

interface CustomerDetails {
  address: string;
  customerName: string;
  customerNames?: string[];
  visitCount: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
  apps: string[];
  visits: Visit[];
  linkedTransactions?: LinkedTransaction[];
  linkedOrders?: LinkedOrder[];
}

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
  userId?: string;
}

export default function CustomerDetailsModal({
  isOpen,
  onClose,
  address,
  userId,
}: CustomerDetailsModalProps) {
  const [data, setData] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && address) {
      fetchCustomerDetails();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, address, userId]);

  const fetchCustomerDetails = async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);

      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `/api/ocr-exports/customers/${encodedAddress}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch customer details");
      }

      const customerData = await response.json();
      setData(customerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch {
      return dateString;
    }
  };

  // Helper function to get ISO week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  const getMaxCount = (items: Array<{ count: number }>) => {
    return Math.max(...items.map((item) => item.count), 1);
  };

  // Calculate time patterns from visits data
  const timePatterns = useMemo(() => {
    if (!data || !data.visits || data.visits.length === 0) {
      return null;
    }

    // Activity by day of week
    const dayOfWeekCounts: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      dayOfWeekCounts[i] = 0;
    }
    data.visits.forEach((visit) => {
      const date = new Date(visit.processedAt || visit.createdAt);
      const dayOfWeek = date.getUTCDay();
      dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
    });

    const dayOfWeekData = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      dayName: getDayOfWeekName(i),
      count: dayOfWeekCounts[i] || 0,
    }));

    // Activity by time of day
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }
    data.visits.forEach((visit) => {
      const date = new Date(visit.processedAt || visit.createdAt);
      const hour = date.getHours(); // Use local time, not UTC
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const timeOfDayData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourBucket: getHourBucketName(i),
      count: hourCounts[i] || 0,
    }));

    // Trends over time - weekly
    const weeklyData: Record<string, number> = {};
    data.visits.forEach((visit) => {
      const date = new Date(visit.processedAt || visit.createdAt);
      const year = date.getUTCFullYear();
      const week = getWeekNumber(date);
      const weekKey = `${year}-W${week.toString().padStart(2, "0")}`;
      weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
    });

    const weeklyTrends = Object.entries(weeklyData)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Trends over time - monthly
    const monthlyData: Record<string, number> = {};
    data.visits.forEach((visit) => {
      const date = new Date(visit.processedAt || visit.createdAt);
      const monthKey = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
    });

    const monthlyTrends = Object.entries(monthlyData)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      dayOfWeek: dayOfWeekData,
      timeOfDay: timeOfDayData,
      trends: {
        weekly: weeklyTrends,
        monthly: monthlyTrends,
      },
    };
  }, [data]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={data?.address || address || "Customer Details"}>
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Total Visits
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.visitCount}
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Customer Names
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.customerNames?.length || 1}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Address
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300">
              {data.address}
            </div>
          </div>

          {/* Customer Names */}
          {data.customerNames && data.customerNames.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer Names
              </div>
              <div className="space-y-1">
                {data.customerNames.map((name, index) => (
                  <div
                    key={index}
                    className="p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300"
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apps */}
          {data.apps.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Apps Used
              </div>
              <div className="flex flex-wrap gap-2">
                {data.apps.map((app) => (
                  <span
                    key={app}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {app}
                  </span>
                ))}
              </div>
            </div>
          )}


          {/* Time Patterns */}
          {timePatterns && (
            <div className="space-y-4">
              {/* Activity by Day of Week */}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Activity by Day of Week
                </div>
                <div className="space-y-2">
                  {timePatterns.dayOfWeek.map((day) => {
                    const maxCount = getMaxCount(timePatterns.dayOfWeek);
                    const percentage = (day.count / maxCount) * 100;
                    return (
                      <div key={day.day} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-gray-600 dark:text-gray-400">
                          {day.dayName}
                        </div>
                        <div className="flex-1">
                          <div className="relative h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
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
              </div>

              {/* Activity by Time of Day */}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Activity by Time of Day
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {timePatterns.timeOfDay.map((hour) => {
                    const maxCount = getMaxCount(timePatterns.timeOfDay);
                    const percentage = (hour.count / maxCount) * 100;
                    return (
                      <div key={hour.hour} className="text-center">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                          {hour.hour}:00
                        </div>
                        <div className="relative h-16 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
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
              </div>

              {/* Trends Over Time */}
              {(timePatterns.trends.weekly.length > 0 ||
                timePatterns.trends.monthly.length > 0) && (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Trends Over Time
                  </div>
                  <div className="space-y-2">
                    {timePatterns.trends.weekly.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          Weekly
                        </div>
                        {timePatterns.trends.weekly.map((trend, index) => {
                          const maxCount = getMaxCount(timePatterns.trends.weekly);
                          const percentage = (trend.count / maxCount) * 100;
                          return (
                            <div key={index} className="flex items-center gap-3 mb-1">
                              <div className="w-20 text-xs text-gray-600 dark:text-gray-400">
                                {trend.week}
                              </div>
                              <div className="flex-1">
                                <div className="relative h-5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
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
                        })}
                      </div>
                    )}
                    {timePatterns.trends.monthly.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 mt-3">
                          Monthly
                        </div>
                        {timePatterns.trends.monthly.map((trend, index) => {
                          const maxCount = getMaxCount(timePatterns.trends.monthly);
                          const percentage = (trend.count / maxCount) * 100;
                          return (
                            <div key={index} className="flex items-center gap-3 mb-1">
                              <div className="w-20 text-xs text-gray-600 dark:text-gray-400">
                                {trend.month}
                              </div>
                              <div className="flex-1">
                                <div className="relative h-5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
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
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Linked Transactions */}
              <div className="mb-6">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Linked Income Transactions
                </div>
                {data.linkedTransactions && data.linkedTransactions.length > 0 ? (
                  <div className="space-y-2">
                    {data.linkedTransactions.map((transaction) => (
                      <div
                        key={transaction._id}
                        className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            ${transaction.amount.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {format(new Date(transaction.date), "MMM d, yyyy")} at {transaction.time}
                          </div>
                        </div>
                        {transaction.tag && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            {transaction.tag}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    No linked transactions
                  </div>
                )}
              </div>

              {/* Linked Orders */}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Linked Delivery Orders
                </div>
                {data.linkedOrders && data.linkedOrders.length > 0 ? (
                  <div className="space-y-2">
                    {data.linkedOrders.map((order) => (
                      <div
                        key={order.id}
                        className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            📦 {order.restaurantName}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {order.appName} • {order.miles.toFixed(1)} mi • ${order.money.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Ratio: ${order.milesToMoneyRatio.toFixed(2)}/mi
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    No linked orders
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

