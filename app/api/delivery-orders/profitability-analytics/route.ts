import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { getCurrentESTAsUTC, parseESTAsUTC } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const excludeApps = searchParams.getAll("excludeApps");
    const timezone = searchParams.get("timezone") || "America/New_York";

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Helper functions for timezone handling
    const getHourInTimezone = (utcDate: Date, tz: string): number => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      });
      return parseInt(formatter.format(utcDate), 10);
    };

    const getDayOfWeekInTimezone = (utcDate: Date, tz: string): number => {
      const year = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(utcDate), 10);
      const month = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(utcDate), 10) - 1;
      const day = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(utcDate), 10);
      const dateInTz = new Date(year, month, day);
      return dateInTz.getDay();
    };

    // Get all delivery orders for the user from this year
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    let orders = await DeliveryOrder.find({
      userId,
      processedAt: { $gte: startOfYear },
    })
      .sort({ processedAt: -1 })
      .lean();

    // Filter out excluded apps if any
    if (excludeApps.length > 0) {
      const excludeAppsLower = excludeApps.map((app) => app.toLowerCase());
      orders = orders.filter(
        (order) => !excludeAppsLower.includes((order.appName || "").toLowerCase())
      );
    }

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: {
          profitabilityHeatmap: [],
          payVsDistance: [],
          timeBasedProfit: [],
          mapHotZones: [],
          storePerformance: [],
          storeHeatTable: [],
          profitPerMinute: [],
        },
      });
    }

    // Fetch all linked transactions for accepted orders
    const acceptedOrderTransactionIds = orders
      .filter((order) => order.linkedTransactionIds && order.linkedTransactionIds.length > 0)
      .flatMap((order) => order.linkedTransactionIds || []);

    const transactions = acceptedOrderTransactionIds.length > 0
      ? await Transaction.find({
          userId,
          _id: { $in: acceptedOrderTransactionIds },
          type: "income",
          date: { $gte: startOfYear },
        }).lean()
      : [];

    const transactionIdMap = new Map<string, any>();
    transactions.forEach((t) => {
      transactionIdMap.set(t._id.toString(), t);
    });

    const orderIdToTransactions = new Map<string, any[]>();
    orders.forEach((order) => {
      if (order.linkedTransactionIds && order.linkedTransactionIds.length > 0) {
        const orderId = order._id.toString();
        const linkedTransactions = order.linkedTransactionIds
          .map((tid) => transactionIdMap.get(tid.toString()))
          .filter((t) => t !== undefined);
        if (linkedTransactions.length > 0) {
          orderIdToTransactions.set(orderId, linkedTransactions);
        }
      }
    });

    // Helper to calculate earnings for an order
    const getOrderEarnings = (order: any): number => {
      const orderId = order._id.toString();
      const orderTransactions = orderIdToTransactions.get(orderId) || [];
      return orderTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    };

    // Helper to estimate time (minutes) - using a simple heuristic: 5 min base + 2 min per mile
    const estimateTime = (order: any): number => {
      const baseTime = 5;
      const miles = order.miles || 0;
      return baseTime + (miles * 2);
    };

    // 1. Profitability Score Heatmap (by hour and store)
    const profitabilityHeatmap: Array<{ hour: number; store: string; score: number; count: number }> = [];
    const heatmapMap = new Map<string, { totalScore: number; count: number }>();

    orders.forEach((order) => {
      const date = new Date(order.processedAt);
      const hour = getHourInTimezone(date, timezone);
      const store = order.restaurantName || "Unknown";
      const key = `${hour}:${store}`;

      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
      if (isAccepted) {
        const earnings = getOrderEarnings(order);
        const miles = order.miles || 0;
        const payPerMile = miles > 0 ? earnings / miles : 0;
        const time = estimateTime(order);
        const payPerMinute = time > 0 ? earnings / time : 0;
        // Profitability score: weighted combination of pay/mile and pay/minute
        const score = (payPerMile * 0.6) + (payPerMinute * 10 * 0.4);

        if (!heatmapMap.has(key)) {
          heatmapMap.set(key, { totalScore: 0, count: 0 });
        }
        const data = heatmapMap.get(key)!;
        data.totalScore += score;
        data.count += 1;
      }
    });

    heatmapMap.forEach((data, key) => {
      const [hourStr, store] = key.split(":");
      profitabilityHeatmap.push({
        hour: parseInt(hourStr, 10),
        store,
        score: data.totalScore / data.count,
        count: data.count,
      });
    });

    // 2. Pay vs Distance Scatter Plot
    const payVsDistance = orders
      .filter((order) => order.miles !== undefined && order.miles > 0)
      .map((order) => {
        const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
        const earnings = isAccepted ? getOrderEarnings(order) : order.money;
        const time = estimateTime(order);
        return {
          distance: order.miles || 0,
          payout: earnings,
          store: order.restaurantName || "Unknown",
          time: time,
          accepted: isAccepted,
          payPerMile: (order.miles || 0) > 0 ? earnings / (order.miles || 1) : 0,
        };
      });

    // 3. Time-Based Profit Timeline
    const timeBasedProfit: Array<{ hour: number; earnings: number; timeSpent: number; orders: number; profitPerMinute: number }> = [];
    const hourMap = new Map<number, { earnings: number; timeSpent: number; orders: number }>();

    orders.forEach((order) => {
      const date = new Date(order.processedAt);
      const hour = getHourInTimezone(date, timezone);
      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;

      if (isAccepted) {
        if (!hourMap.has(hour)) {
          hourMap.set(hour, { earnings: 0, timeSpent: 0, orders: 0 });
        }
        const data = hourMap.get(hour)!;
        data.earnings += getOrderEarnings(order);
        data.timeSpent += estimateTime(order);
        data.orders += 1;
      }
    });

    for (let hour = 0; hour < 24; hour++) {
      const data = hourMap.get(hour);
      if (data) {
        timeBasedProfit.push({
          hour,
          earnings: data.earnings,
          timeSpent: data.timeSpent,
          orders: data.orders,
          profitPerMinute: data.timeSpent > 0 ? data.earnings / data.timeSpent : 0,
        });
      } else {
        timeBasedProfit.push({
          hour,
          earnings: 0,
          timeSpent: 0,
          orders: 0,
          profitPerMinute: 0,
        });
      }
    }

    // 4. Map Hot Zones
    const mapHotZones = orders
      .filter((order) => order.userLatitude && order.userLongitude)
      .map((order) => {
        const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
        const earnings = isAccepted ? getOrderEarnings(order) : 0;
        const miles = order.miles || 0;
        const payPerMile = miles > 0 ? earnings / miles : 0;
        return {
          latitude: order.userLatitude!,
          longitude: order.userLongitude!,
          profit: payPerMile,
          earnings: earnings,
          store: order.restaurantName || "Unknown",
          accepted: isAccepted,
        };
      });

    // 5. Store Performance (Box-and-Whisker data)
    const storePerformanceMap = new Map<string, number[]>();
    orders.forEach((order) => {
      const store = order.restaurantName || "Unknown";
      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
      if (isAccepted) {
        const earnings = getOrderEarnings(order);
        if (!storePerformanceMap.has(store)) {
          storePerformanceMap.set(store, []);
        }
        storePerformanceMap.get(store)!.push(earnings);
      }
    });

    const calculateStats = (values: number[]) => {
      if (values.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      const q1Index = Math.floor(sorted.length * 0.25);
      const medianIndex = Math.floor(sorted.length * 0.5);
      const q3Index = Math.floor(sorted.length * 0.75);
      return {
        min: sorted[0],
        q1: sorted[q1Index],
        median: sorted[medianIndex],
        q3: sorted[q3Index],
        max: sorted[sorted.length - 1],
      };
    };

    const storePerformance = Array.from(storePerformanceMap.entries())
      .map(([store, payouts]) => ({
        store,
        ...calculateStats(payouts),
        count: payouts.length,
      }))
      .filter((s) => s.count >= 3) // Only include stores with at least 3 orders
      .sort((a, b) => b.median - a.median);

    // 6. Store Heat Table
    const storeHeatTableMap = new Map<string, {
      totalPay: number;
      totalMiles: number;
      totalTime: number;
      acceptedCount: number;
      totalOffers: number;
    }>();

    orders.forEach((order) => {
      const store = order.restaurantName || "Unknown";
      if (!storeHeatTableMap.has(store)) {
        storeHeatTableMap.set(store, {
          totalPay: 0,
          totalMiles: 0,
          totalTime: 0,
          acceptedCount: 0,
          totalOffers: 0,
        });
      }
      const data = storeHeatTableMap.get(store)!;
      data.totalOffers += 1;

      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
      if (isAccepted) {
        data.acceptedCount += 1;
        data.totalPay += getOrderEarnings(order);
        data.totalMiles += order.miles || 0;
        data.totalTime += estimateTime(order);
      }
    });

    const storeHeatTable = Array.from(storeHeatTableMap.entries())
      .map(([store, data]) => ({
        store,
        avgPay: data.acceptedCount > 0 ? data.totalPay / data.acceptedCount : 0,
        avgMiles: data.acceptedCount > 0 ? data.totalMiles / data.acceptedCount : 0,
        payPerMile: data.totalMiles > 0 ? data.totalPay / data.totalMiles : 0,
        avgTime: data.acceptedCount > 0 ? data.totalTime / data.acceptedCount : 0,
        payPerMinute: data.totalTime > 0 ? data.totalPay / data.totalTime : 0,
        acceptanceRate: data.totalOffers > 0 ? (data.acceptedCount / data.totalOffers) * 100 : 0,
        recommended: (data.totalMiles > 0 ? data.totalPay / data.totalMiles : 0) >= 1.25 && 
                     (data.totalTime > 0 ? data.totalPay / data.totalTime : 0) >= 0.3,
      }))
      .sort((a, b) => b.payPerMinute - a.payPerMinute);

    // 7. Profit Per Minute (PPM) data
    const profitPerMinute = orders
      .filter((order) => order.linkedTransactionIds && order.linkedTransactionIds.length > 0)
      .map((order) => {
        const earnings = getOrderEarnings(order);
        const time = estimateTime(order);
        return {
          orderId: order._id.toString(),
          earnings,
          time,
          profitPerMinute: time > 0 ? earnings / time : 0,
          store: order.restaurantName || "Unknown",
          miles: order.miles || 0,
        };
      })
      .sort((a, b) => b.profitPerMinute - a.profitPerMinute);

    return NextResponse.json({
      success: true,
      analytics: {
        profitabilityHeatmap,
        payVsDistance,
        timeBasedProfit,
        mapHotZones,
        storePerformance,
        storeHeatTable,
        profitPerMinute,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
