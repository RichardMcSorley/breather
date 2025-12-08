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
    const dayOfWeekParam = searchParams.get("dayOfWeek");
    const dayOfWeek = dayOfWeekParam !== null ? parseInt(dayOfWeekParam, 10) : null;
    const timezone = searchParams.get("timezone") || "America/New_York"; // Default to EST if not provided

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Helper function to get day of week in timezone (must be defined before use)
    const getDayOfWeekInTimezone = (utcDate: Date, tz: string): number => {
      // Format date components in the target timezone
      const year = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(utcDate), 10);
      const month = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(utcDate), 10) - 1; // 0-indexed
      const day = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(utcDate), 10);
      // Create a date object from these components (in local time) and get day of week
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

    // Keep all orders for overview calculations (day filter only affects bestRestaurantByHour)
    const allOrders = orders;
    
    // Filter by day of week if specified (0 = Sunday, 6 = Saturday) - only for bestRestaurantByHour
    let filteredOrdersForBestRestaurant = orders;
    if (dayOfWeek !== null && !isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
      filteredOrdersForBestRestaurant = orders.filter((order) => {
        const orderDate = new Date(order.processedAt);
        const orderDayOfWeek = getDayOfWeekInTimezone(orderDate, timezone); // 0 = Sunday, 6 = Saturday
        return orderDayOfWeek === dayOfWeek;
      });
    }

    // Use all orders for overview calculations
    orders = allOrders;
    
    // Get unique app names for filter
    const availableApps = Array.from(
      new Set(orders.map((order) => order.appName).filter(Boolean))
    ).sort();


    // Fetch all linked transactions for accepted orders to get actual earnings
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

    // Create a map of order ID to transaction amounts
    const orderIdToTransactions = new Map<string, any[]>();
    const transactionIdMap = new Map<string, any>();
    transactions.forEach((t) => {
      transactionIdMap.set(t._id.toString(), t);
    });

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

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: {
          overview: {
            totalOffers: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            medianRatioAccepted: 0,
            medianRatioRejected: 0,
          },
          byRestaurant: [],
          byTime: {},
          byRatioRange: [],
          locationInsights: {
            hotZones: [],
            routeEfficiency: 0,
          },
        },
      });
    }

    // Calculate overview metrics (no overall acceptance rate, only per-app)
    const acceptedOrders = orders.filter(
      (order) => order.linkedTransactionIds && order.linkedTransactionIds.length > 0
    );
    const rejectedOrders = orders.filter(
      (order) => !order.linkedTransactionIds || order.linkedTransactionIds.length === 0
    );

    // Helper function to calculate median (used for restaurants)
    const calculateMedian = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    const totalOffers = orders.length;
    const acceptedCount = acceptedOrders.length;
    const rejectedCount = rejectedOrders.length;

    const acceptedRatios = acceptedOrders.map((o) => o.milesToMoneyRatio).filter((r): r is number => r !== undefined && r > 0);
    const rejectedRatios = rejectedOrders.map((o) => o.milesToMoneyRatio).filter((r): r is number => r !== undefined && r > 0);

    const medianRatioAccepted = calculateMedian(acceptedRatios);
    const medianRatioRejected = calculateMedian(rejectedRatios);

    // Analytics by Restaurant
    const restaurantMap = new Map<string, any>();
    orders.forEach((order) => {
      const restaurantName = order.restaurantName || "Unknown";
      const appName = order.appName || "Unknown";
      if (!restaurantMap.has(restaurantName)) {
        restaurantMap.set(restaurantName, {
          restaurantName,
          totalOffers: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          acceptanceRate: 0,
          avgRatioAccepted: 0,
          acceptedRatios: [] as number[],
          earnings: 0,
        });
      }
      const restaurantData = restaurantMap.get(restaurantName)!;
      restaurantData.totalOffers++;
      
      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
      if (isAccepted) {
        restaurantData.acceptedCount++;
        if (order.milesToMoneyRatio !== undefined) {
          restaurantData.acceptedRatios.push(order.milesToMoneyRatio);
        }
        // Add earnings from linked transactions
        const orderId = order._id.toString();
        const orderTransactions = orderIdToTransactions.get(orderId) || [];
        orderTransactions.forEach((t) => {
          restaurantData.earnings += t.amount || 0;
        });
      } else {
        restaurantData.rejectedCount++;
      }
    });

    const byRestaurant = Array.from(restaurantMap.values())
      .map((restaurantData) => {
        const medianRatioAccepted =
          restaurantData.acceptedRatios.length > 0
            ? calculateMedian(restaurantData.acceptedRatios)
            : 0;
        
        const medianRatioRounded = Math.round(medianRatioAccepted * 100) / 100;
        
        // Calculate median earnings per order for this restaurant
        const restaurantAcceptedOrders = orders.filter(
          (o) => o.restaurantName === restaurantData.restaurantName &&
                 o.linkedTransactionIds && o.linkedTransactionIds.length > 0
        );
        const earningsPerOrder: number[] = [];
        restaurantAcceptedOrders.forEach((order) => {
          const orderId = order._id.toString();
          const orderTransactions = orderIdToTransactions.get(orderId) || [];
          const totalEarnings = orderTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
          if (totalEarnings > 0) {
            earningsPerOrder.push(totalEarnings);
          }
        });
        const medianEarningsPerOrder = calculateMedian(earningsPerOrder);

        return {
          restaurantName: restaurantData.restaurantName,
          totalOffers: restaurantData.totalOffers,
          acceptedCount: restaurantData.acceptedCount,
          rejectedCount: restaurantData.rejectedCount,
          acceptanceRate:
            restaurantData.totalOffers > 0
              ? (restaurantData.acceptedCount / restaurantData.totalOffers) * 100
              : 0,
          medianRatioAccepted: medianRatioRounded,
          totalEarnings: restaurantData.earnings,
          medianEarningsPerOrder: Math.round(medianEarningsPerOrder * 100) / 100,
          // Keep combinedScore for sorting but don't include in response
          _combinedScore: medianRatioRounded * restaurantData.totalOffers,
        };
      })
      .sort((a, b) => b.totalEarnings - a.totalEarnings);

    // Helper function to get hour and minutes in user's timezone
    const getHourInTimezone = (utcDate: Date, tz: string): number => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      });
      return parseInt(formatter.format(utcDate), 10);
    };

    // Calculate best restaurant per hour (highest combined score in that hour)
    // Use filtered orders if dayOfWeek filter is applied
    const hourRestaurantMap = new Map<string, any>(); // Key: "hour:restaurantName"
    filteredOrdersForBestRestaurant.forEach((order) => {
      const date = new Date(order.processedAt);
      const hour = getHourInTimezone(date, timezone);
      const restaurantName = order.restaurantName || "Unknown";
      const key = `${hour}:${restaurantName}`;

      if (!hourRestaurantMap.has(key)) {
        hourRestaurantMap.set(key, {
          hour,
          restaurantName,
          orders: [] as any[],
          acceptedRatios: [] as number[],
        });
      }
      const hourRestaurantData = hourRestaurantMap.get(key)!;
      hourRestaurantData.orders.push(order);
      if (order.linkedTransactionIds && order.linkedTransactionIds.length > 0) {
        if (order.milesToMoneyRatio !== undefined) {
          hourRestaurantData.acceptedRatios.push(order.milesToMoneyRatio);
        }
      }
    });

    // Calculate combined score for each hour-restaurant combination
    const hourRestaurantScores = Array.from(hourRestaurantMap.values()).map((data) => {
      const volume = data.orders.length;
      const medianRatio = data.acceptedRatios.length > 0
        ? calculateMedian(data.acceptedRatios)
        : 0;
      const combinedScore = medianRatio * volume;

      return {
        hour: data.hour,
        restaurantName: data.restaurantName,
        volume,
        medianRatio: Math.round(medianRatio * 100) / 100,
        combinedScore: Math.round(combinedScore * 100) / 100,
      };
    });

    // Find best restaurant for each hour
    const bestRestaurantByHour = Array.from({ length: 24 }, (_, hour) => {
      const hourScores = hourRestaurantScores.filter((item) => item.hour === hour);
      if (hourScores.length === 0) {
        return null;
      }

      // Find the restaurant with highest combined score for this hour
      const best = hourScores.reduce((best, current) =>
        current.combinedScore > best.combinedScore ? current : best
      );

      return {
        hour,
        restaurantName: best.restaurantName,
        medianRatio: best.medianRatio,
        volume: best.volume,
      };
    }).filter((item) => item !== null);

    // Analytics by Day of Week
    const dayMap = new Map<number, any>();
    orders.forEach((order) => {
      const date = new Date(order.processedAt);
      const dayOfWeek = getDayOfWeekInTimezone(date, timezone); // 0 = Sunday, 6 = Saturday
      if (!dayMap.has(dayOfWeek)) {
        dayMap.set(dayOfWeek, {
          dayOfWeek,
          totalOffers: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          acceptanceRate: 0,
          avgRatio: 0,
          ratios: [] as number[],
          earnings: 0,
        });
      }
      const dayData = dayMap.get(dayOfWeek)!;
      dayData.totalOffers++;
      const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
      if (isAccepted) {
        dayData.acceptedCount++;
        // Add earnings from linked transactions
        const orderId = order._id.toString();
        const orderTransactions = orderIdToTransactions.get(orderId) || [];
        orderTransactions.forEach((t) => {
          dayData.earnings += t.amount || 0;
        });
      } else {
        dayData.rejectedCount++;
      }
      if (order.milesToMoneyRatio !== undefined) {
        dayData.ratios.push(order.milesToMoneyRatio);
      }
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDayOfWeek = Array.from({ length: 7 }, (_, day) => {
      const dayData = dayMap.get(day);
      if (!dayData) {
        return {
          dayOfWeek: day,
          dayName: dayNames[day],
          totalOffers: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          acceptanceRate: 0,
          avgRatio: 0,
          earnings: 0,
        };
      }
      return {
        dayOfWeek: day,
        dayName: dayNames[day],
        totalOffers: dayData.totalOffers,
        acceptedCount: dayData.acceptedCount,
        rejectedCount: dayData.rejectedCount,
        acceptanceRate:
          dayData.totalOffers > 0 ? (dayData.acceptedCount / dayData.totalOffers) * 100 : 0,
        avgRatio:
          dayData.ratios.length > 0
            ? dayData.ratios.reduce((sum: number, r: number) => sum + r, 0) / dayData.ratios.length
            : 0,
        earnings: dayData.earnings,
      };
    });

    // Analytics by Ratio Range
    const ratioRanges = [
      { min: 0, max: 1, label: "<$1" },
      { min: 1, max: 1.5, label: "$1-$1.5" },
      { min: 1.5, max: 2, label: "$1.5-$2" },
      { min: 2, max: 2.5, label: "$2-$2.5" },
      { min: 2.5, max: Infinity, label: ">$2.5" },
    ];

    const byRatioRange = ratioRanges.map((range) => {
      const rangeOrders = orders.filter(
        (order) =>
          order.milesToMoneyRatio !== undefined &&
          order.milesToMoneyRatio >= range.min &&
          order.milesToMoneyRatio < range.max
      );
      const accepted = rangeOrders.filter(
        (order) => order.linkedTransactionIds && order.linkedTransactionIds.length > 0
      );
      const rejected = rangeOrders.filter(
        (order) => !order.linkedTransactionIds || order.linkedTransactionIds.length === 0
      );

      return {
        range: range.label,
        min: range.min,
        max: range.max === Infinity ? null : range.max,
        totalOffers: rangeOrders.length,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        acceptanceRate:
          rangeOrders.length > 0 ? (accepted.length / rangeOrders.length) * 100 : 0,
      };
    });

    // Helper function to calculate optimal threshold for a set of orders
    // Accounts for hourly capacity constraints (3 orders/hour)
    // Location Insights
    // Group orders by approximate location (using lat/lon rounded to 2 decimals = ~1km)
    const locationMap = new Map<string, any>();
    orders.forEach((order) => {
      if (order.userLatitude && order.userLongitude) {
        const latRounded = Math.round(order.userLatitude * 100) / 100;
        const lonRounded = Math.round(order.userLongitude * 100) / 100;
        const locationKey = `${latRounded},${lonRounded}`;
        const appName = order.appName || "Unknown";

        if (!locationMap.has(locationKey)) {
          locationMap.set(locationKey, {
            latitude: latRounded,
            longitude: lonRounded,
            totalOffers: 0,
            acceptedCount: 0,
            earnings: 0,
            totalMiles: 0,
          });
        }

        const locationData = locationMap.get(locationKey)!;
        locationData.totalOffers++;
        const isAccepted = order.linkedTransactionIds && order.linkedTransactionIds.length > 0;
        if (isAccepted) {
          locationData.acceptedCount++;
          const orderId = order._id.toString();
          const orderTransactions = orderIdToTransactions.get(orderId) || [];
          orderTransactions.forEach((t) => {
            locationData.earnings += t.amount || 0;
          });
          locationData.totalMiles += order.miles || 0;
        }
      }
    });

    const allZones = Array.from(locationMap.values())
      .map((loc) => ({
        latitude: loc.latitude,
        longitude: loc.longitude,
        totalOffers: loc.totalOffers,
        acceptedCount: loc.acceptedCount,
        earnings: loc.earnings,
        earningsPerMile: loc.totalMiles > 0 ? loc.earnings / loc.totalMiles : 0,
      }));

    // Top earnings zones (sorted by earnings)
    const topEarningsZones = [...allZones]
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);

    // Top volume zones (sorted by totalOffers)
    const topVolumeZones = [...allZones]
      .sort((a, b) => b.totalOffers - a.totalOffers)
      .slice(0, 10);

    // Calculate overall route efficiency (earnings per mile)
    const totalMilesFromAccepted = acceptedOrders.reduce((sum, o) => sum + (o.miles || 0), 0);
    const totalEarningsForRoute = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const routeEfficiency = totalMilesFromAccepted > 0 ? totalEarningsForRoute / totalMilesFromAccepted : 0;


    return NextResponse.json({
      success: true,
      analytics: {
          overview: {
            totalOffers,
            acceptedCount,
            rejectedCount,
            medianRatioAccepted: Math.round(medianRatioAccepted * 100) / 100,
            medianRatioRejected: Math.round(medianRatioRejected * 100) / 100,
          },
        availableApps,
        byRestaurant,
        bestRestaurantByHour,
        byTime: {},
        byRatioRange,
        locationInsights: {
          topEarningsZones,
          topVolumeZones,
          routeEfficiency: Math.round(routeEfficiency * 100) / 100,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

