"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import EditDeliveryOrderModal from "@/components/EditDeliveryOrderModal";
import Modal from "@/components/ui/Modal";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamically import MapContent to avoid SSR issues with Leaflet
const MapContent = dynamic(() => import("@/components/MapContent"), {
  ssr: false,
});

interface AnalyticsData {
  overview: {
    totalOffers: number;
    acceptedCount: number;
    rejectedCount: number;
    medianRatioAccepted: number;
    medianRatioRejected: number;
  };
  availableApps?: string[];
  byRestaurant: Array<{
    restaurantName: string;
    totalOffers: number;
    acceptedCount: number;
    rejectedCount: number;
    acceptanceRate: number;
    medianRatioAccepted: number;
    totalEarnings?: number;
    medianEarningsPerOrder?: number;
  }>;
  bestRestaurantByHour?: Array<{
    hour: number;
    restaurantName: string;
    medianRatio: number;
    volume: number;
  }>;
  byTime: {};
  locationInsights?: {
    topEarningsZones: Array<{
      latitude: number;
      longitude: number;
      totalOffers: number;
      acceptedCount: number;
      earnings: number;
      earningsPerMile: number;
    }>;
    topVolumeZones: Array<{
      latitude: number;
      longitude: number;
      totalOffers: number;
      acceptedCount: number;
      earnings: number;
      earningsPerMile: number;
    }>;
    routeEfficiency: number;
  };
}

export default function OrderAnalyticsPage() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedApps, setExcludedApps] = useState<string[]>(["roadie", "shopper", "uber driver"]);
  const [showAppFilter, setShowAppFilter] = useState(false);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null); // null = all days, 0-6 = Sunday-Saturday
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<{ latitude: number; longitude: number; index: number } | null>(null);
  const [locationTab, setLocationTab] = useState<"earnings" | "volume">("earnings");
  const filterRef = useRef<HTMLDivElement>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, excludedApps, selectedDayOfWeek]);


  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowAppFilter(false);
      }
    };

    if (showAppFilter) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showAppFilter]);

  const fetchAnalytics = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("userId", userId);
      if (excludedApps.length > 0) {
        excludedApps.forEach((app) => params.append("excludeApps", app));
      }
      if (selectedDayOfWeek !== null) {
        params.append("dayOfWeek", selectedDayOfWeek.toString());
      }
      // Detect user's timezone and send to API
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      params.append("timezone", userTimezone);
      const response = await fetch(`/api/delivery-orders/analytics?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      const data = await response.json();
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Get unique app names from analytics data
  const availableApps = analytics?.availableApps || [];

  const handleAppFilterToggle = (appName: string) => {
    setExcludedApps((prev) => {
      const isExcluded = prev.some(
        (excluded) => excluded.toLowerCase() === appName.toLowerCase()
      );
      if (isExcluded) {
        // Remove (case-insensitive match)
        return prev.filter((app) => app.toLowerCase() !== appName.toLowerCase());
      } else {
        // Add the actual app name from the list (preserves capitalization)
        return [...prev, appName];
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12:00 AM";
    if (hour === 12) return "12:00 PM";
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Layout>
    );
  }

  if (!userId) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-red-600 dark:text-red-400">Error: {error}</div>
        </Card>
      </Layout>
    );
  }

  if (!analytics) {
    return (
      <Layout>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No analytics data available.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Order Analytics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {selectedDayOfWeek !== null
                ? `Insights into your order acceptance patterns and performance for ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][selectedDayOfWeek]}s (this year)`
                : "Insights into your order acceptance patterns and performance (this year)"}
            </p>
          </div>
          {availableApps.length > 0 && (
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowAppFilter(!showAppFilter)}
                className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span>Filter Apps</span>
                {excludedApps.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {excludedApps.length}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 transition-transform ${showAppFilter ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showAppFilter && (
                <Card className="absolute right-0 top-full mt-2 z-50 min-w-[200px] max-w-md">
                  <div className="p-4">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      Exclude Apps
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {availableApps.map((app) => (
                        <label
                          key={app}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={excludedApps.some(
                              (excluded) => excluded.toLowerCase() === app.toLowerCase()
                            )}
                            onChange={() => handleAppFilterToggle(app)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{app}</span>
                        </label>
                      ))}
                    </div>
                    {excludedApps.length > 0 && (
                      <button
                        onClick={() => setExcludedApps([])}
                        className="mt-3 w-full px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
        {excludedApps.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Excluding:</span>
            {excludedApps.map((app) => (
              <span
                key={app}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              >
                {app}
                <button
                  onClick={() => handleAppFilterToggle(app)}
                  className="hover:text-red-900 dark:hover:text-red-300"
                  aria-label={`Remove ${app} filter`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>


      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Total Offers
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {analytics.overview.totalOffers}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Accepted
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {analytics.overview.acceptedCount}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {analytics.overview.rejectedCount} rejected
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Median Ratio (Accepted)
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(analytics.overview.medianRatioAccepted)}/mi
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Median Ratio (Rejected)
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatCurrency(analytics.overview.medianRatioRejected)}/mi
          </div>
        </Card>
      </div>

      {/* Best Restaurant by Hour */}
      {analytics.bestRestaurantByHour && analytics.bestRestaurantByHour.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Best Restaurant by Hour
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            The highest scoring restaurant (median ratio × volume) for each hour of the day.
          </p>
          {/* Day of Week Tabs - Only filters Best Restaurant by Hour */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSelectedDayOfWeek(null)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  selectedDayOfWeek === null
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                All Days
              </button>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                (day, index) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDayOfWeek(index)}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                      selectedDayOfWeek === index
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {day}
                  </button>
                )
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Hour
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Restaurant
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Median $/Mile
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Volume
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {analytics.bestRestaurantByHour.map((hourData) => (
                  <tr
                    key={hourData.hour}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatHour(hourData.hour)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {hourData.restaurantName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {formatCurrency(hourData.medianRatio)}/mi
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {hourData.volume}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}


      {/* Location Insights */}
      {analytics.locationInsights && 
       (analytics.locationInsights.topEarningsZones.length > 0 || analytics.locationInsights.topVolumeZones.length > 0) && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Location Insights
          </h3>
          <div className="mb-4">
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setLocationTab("earnings")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  locationTab === "earnings"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                Top Earnings
              </button>
              <button
                onClick={() => setLocationTab("volume")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  locationTab === "volume"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                Highest Volume
              </button>
            </div>
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Location
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Offers
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Accepted
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Earnings
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                      $/Mile
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {(locationTab === "earnings" 
                    ? analytics.locationInsights.topEarningsZones 
                    : analytics.locationInsights.topVolumeZones
                  ).map((zone, index) => (
                    <tr
                      key={`${zone.latitude}-${zone.longitude}`}
                      onClick={() => setSelectedZone({ latitude: zone.latitude, longitude: zone.longitude, index })}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-white">
                          Zone {index + 1}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {zone.latitude.toFixed(2)}, {zone.longitude.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {zone.totalOffers}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {zone.acceptedCount}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(zone.earnings)}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">
                        {formatCurrency(zone.earningsPerMile)}/mi
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Zone Map Modal */}
      <Modal
        isOpen={selectedZone !== null}
        onClose={() => setSelectedZone(null)}
        title={`Zone ${selectedZone ? selectedZone.index + 1 : ''} Location`}
      >
        {selectedZone && (
          <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <MapContent
              locations={[
                {
                  id: `zone-${selectedZone.index}`,
                  name: `Zone ${selectedZone.index + 1}`,
                  address: `${selectedZone.latitude.toFixed(3)}, ${selectedZone.longitude.toFixed(3)}`,
                  lat: selectedZone.latitude,
                  lon: selectedZone.longitude,
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Edit Delivery Order Modal */}
      {userId && (
        <EditDeliveryOrderModal
          isOpen={viewingOrderId !== null}
          onClose={() => setViewingOrderId(null)}
          orderId={viewingOrderId}
          userId={userId}
          onUpdate={() => {
            setViewingOrderId(null);
            // Refresh analytics data
            if (userId) {
              fetchAnalytics();
            }
          }}
        />
      )}
    </Layout>
  );
}

