"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import {
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const MapContent = dynamic(() => import("@/components/MapContent"), {
  ssr: false,
});

interface ProfitabilityAnalytics {
  profitabilityHeatmap: Array<{ hour: number; store: string; score: number; count: number }>;
  payVsDistance: Array<{ distance: number; payout: number; store: string; time: number; accepted: boolean; payPerMile: number }>;
  timeBasedProfit: Array<{ hour: number; earnings: number; timeSpent: number; orders: number; profitPerMinute: number }>;
  mapHotZones: Array<{ latitude: number; longitude: number; profit: number; earnings: number; store: string; accepted: boolean }>;
  storePerformance: Array<{ store: string; min: number; q1: number; median: number; q3: number; max: number; count: number }>;
  storeHeatTable: Array<{ store: string; avgPay: number; avgMiles: number; payPerMile: number; avgTime: number; payPerMinute: number; acceptanceRate: number; recommended: boolean }>;
  profitPerMinute: Array<{ orderId: string; earnings: number; time: number; profitPerMinute: number; store: string; miles: number }>;
}

export default function ProfitabilityAnalyticsPage() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<ProfitabilityAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedApps, setExcludedApps] = useState<string[]>([]);
  const [minPayPerMile, setMinPayPerMile] = useState(1.25);
  const [minPayPerMinute, setMinPayPerMinute] = useState(0.3);
  const [gasCost, setGasCost] = useState(0.15);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (userId) {
      fetchAnalytics();
    }
  }, [userId, excludedApps]);

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
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      params.append("timezone", userTimezone);
      const response = await fetch(`/api/delivery-orders/profitability-analytics?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch profitability analytics");
      }
      const data = await response.json();
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  // Prepare heatmap data
  const prepareHeatmapData = () => {
    if (!analytics) return [];
    const storeSet = new Set(analytics.profitabilityHeatmap.map((d) => d.store));
    const stores = Array.from(storeSet);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return hours.map((hour) => {
      const data: any = { hour, hourLabel: formatHour(hour) };
      stores.forEach((store) => {
        const entry = analytics.profitabilityHeatmap.find((d) => d.hour === hour && d.store === store);
        data[store] = entry ? entry.score : null;
      });
      return data;
    });
  };

  // Get color for profitability score
  const getProfitabilityColor = (score: number | null) => {
    if (score === null) return "#e5e7eb";
    if (score >= 2.5) return "#10b981"; // green
    if (score >= 2.0) return "#84cc16"; // lime
    if (score >= 1.5) return "#eab308"; // yellow
    if (score >= 1.0) return "#f97316"; // orange
    return "#ef4444"; // red
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

  const heatmapData = prepareHeatmapData();
  const stores = Array.from(new Set(analytics.profitabilityHeatmap.map((d) => d.store)));

  // Calculate average PPM
  const avgPPM = analytics.profitPerMinute.length > 0
    ? analytics.profitPerMinute.reduce((sum, d) => sum + d.profitPerMinute, 0) / analytics.profitPerMinute.length
    : 0;

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Profitability Analytics</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Data-driven insights to optimize your gig-app earnings
        </p>
      </div>

      {/* What-If Simulator Controls */}
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">What-If Simulator</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Min $/Mile: {formatCurrency(minPayPerMile)}
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={minPayPerMile}
              onChange={(e) => setMinPayPerMile(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Min $/Minute: {formatCurrency(minPayPerMinute)}
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={minPayPerMinute}
              onChange={(e) => setMinPayPerMinute(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Gas Cost per Mile: {formatCurrency(gasCost)}
            </label>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.01"
              value={gasCost}
              onChange={(e) => setGasCost(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* 1. Profitability Score Heatmap */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          1. Profitability Score Heatmap
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Shows when and where you earn the most (green = profitable, red = not worth it)
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left text-gray-700 dark:text-gray-300">Hour</th>
                  {stores.slice(0, 8).map((store) => (
                    <th key={store} className="px-2 py-2 text-center text-gray-700 dark:text-gray-300">
                      {store.length > 12 ? store.substring(0, 12) + "..." : store}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row) => (
                  <tr key={row.hour}>
                    <td className="px-2 py-2 font-medium text-gray-900 dark:text-white">{row.hourLabel}</td>
                    {stores.slice(0, 8).map((store) => {
                      const score = row[store as keyof typeof row] as number | null;
                      const bgColor = getProfitabilityColor(score);
                      return (
                        <td
                          key={store}
                          className="px-2 py-2 text-center"
                          style={{ backgroundColor: bgColor }}
                          title={`${store} at ${row.hourLabel}: ${score !== null ? formatCurrency(score) : "No data"}`}
                        >
                          {score !== null ? (
                            <span className="text-white font-semibold">{score.toFixed(1)}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">High Profit (&gt;$2.50/mi)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Medium ($1.50-$2.50/mi)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Low (&lt;$1.50/mi)</span>
          </div>
        </div>
      </Card>

      {/* 2. Pay vs Distance Scatter Plot */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          2. Pay vs Distance Scatter Plot
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Visualize which offers are above your minimum acceptable rate. Points above a diagonal line from origin would meet your ${minPayPerMile}/mile threshold.
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="distance" name="Distance" unit=" mi" domain={[0, 'dataMax']} />
            <YAxis type="number" dataKey="payout" name="Payout" unit=" $" domain={[0, 'dataMax']} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: number, name: string) => {
              if (name === "payout") return formatCurrency(value);
              if (name === "distance") return `${value.toFixed(1)} mi`;
              return value;
            }} />
            <Scatter
              name="Accepted"
              data={analytics.payVsDistance.filter((d) => d.accepted)}
              fill="#10b981"
            />
            <Scatter
              name="Rejected"
              data={analytics.payVsDistance.filter((d) => !d.accepted)}
              fill="#ef4444"
            />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <p>💡 Tip: Offers with payout/distance ≥ ${minPayPerMile}/mile are typically profitable</p>
        </div>
      </Card>

      {/* 3. Time-Based Profit Timeline */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          3. Time-Based Profit Timeline
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          See which hours generate the most earnings and profit per minute
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={analytics.timeBasedProfit}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tickFormatter={formatHour} />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="earnings" fill="#3b82f6" name="Earnings ($)" />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="profitPerMinute"
              stroke="#10b981"
              strokeWidth={2}
              name="Profit/Min ($)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* 4. Map Hot Zones */}
      {analytics.mapHotZones.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            4. Map Hot Zones
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Identify profitable neighborhoods and dead zones
          </p>
          <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <MapContent
              locations={analytics.mapHotZones
                .filter((zone) => zone.accepted)
                .slice(0, 50)
                .map((zone, idx) => ({
                  id: `zone-${idx}`,
                  name: zone.store,
                  address: `${zone.latitude.toFixed(4)}, ${zone.longitude.toFixed(4)}`,
                  lat: zone.latitude,
                  lon: zone.longitude,
                }))}
            />
          </div>
        </Card>
      )}

      {/* 5. Store Performance Box Plot */}
      {analytics.storePerformance.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            5. Store Performance Comparison
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Compare payout variance between locations (showing min, Q1, median, Q3, max)
          </p>
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={analytics.storePerformance.slice(0, 10)}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="store" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="median" fill="#10b981" name="Median" />
                <Bar dataKey="q3" fill="#84cc16" name="Q3" />
                <Bar dataKey="max" fill="#3b82f6" name="Max" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            <p>Showing stores with at least 3 orders. Median represents typical payout.</p>
          </div>
        </Card>
      )}

      {/* 6. Store Heat Table */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          6. Store Heat Table
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Clear metrics for each store to guide your decisions
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Store
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Avg Pay
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Avg Miles
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  $/Mile
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Avg Time
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  $/Min
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Accept Rate
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                  Recommended
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {analytics.storeHeatTable.map((row) => (
                <tr
                  key={row.store}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    selectedStore === row.store ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                  onClick={() => setSelectedStore(row.store === selectedStore ? null : row.store)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.store}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(row.avgPay)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {row.avgMiles.toFixed(1)} mi
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(row.payPerMile)}/mi
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {Math.round(row.avgTime)} min
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(row.payPerMinute)}/min
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {row.acceptanceRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.recommended ? (
                      <span className="text-green-600 dark:text-green-400">👍</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">👎</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 7. Profit Per Minute Gauge */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          7. Profit Per Minute (PPM) Overview
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your strongest metric for gig decisions - how much you earn per minute of active time
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Average PPM
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(avgPPM)}/min
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Top PPM
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {analytics.profitPerMinute.length > 0
                ? formatCurrency(analytics.profitPerMinute[0].profitPerMinute)
                : "$0.00"}
              /min
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Total Orders
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {analytics.profitPerMinute.length}
            </div>
          </Card>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.profitPerMinute.slice(0, 20)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="store" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="profitPerMinute" fill="#10b981" name="Profit/Min ($)" />
            <ReferenceLine
              y={minPayPerMinute}
              stroke="#3b82f6"
              strokeDasharray="3 3"
              label={{ value: `Min: $${minPayPerMinute}/min`, position: "right" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 8. Acceptance Strategy Decision Tree (Visual) */}
      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          8. Acceptance Strategy Decision Tree
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your decision rules visualized
        </p>
        <div className="flex flex-col items-center space-y-4">
          <div className="text-center p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">New Offer</div>
          </div>
          <div className="text-2xl">↓</div>
          <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Is payout ≥ {formatCurrency(minPayPerMile * 5)}?
            </div>
          </div>
          <div className="text-2xl">↓ Yes</div>
          <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Is $/mile ≥ {formatCurrency(minPayPerMile)}?
            </div>
          </div>
          <div className="text-2xl">↓ Yes</div>
          <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Is $/minute ≥ {formatCurrency(minPayPerMinute)}?
            </div>
          </div>
          <div className="text-2xl">↓ Yes</div>
          <div className="text-center p-6 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <div className="text-lg font-bold text-green-700 dark:text-green-400">✓ ACCEPT</div>
          </div>
        </div>
      </Card>
    </Layout>
  );
}
