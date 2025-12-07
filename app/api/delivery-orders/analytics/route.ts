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

    const getMinutesInTimezone = (utcDate: Date, tz: string): number => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        minute: "numeric",
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

    // Helper function to calculate best orders by hour for a given date range
    const calculateBestOrdersByHour = (dateRangeOrders: any[]) => {
      // Constants for time calculations
      const AVERAGE_SPEED_MPH = 35;
      const WAIT_TIME_MINUTES = 3;
      const SEGMENT_DURATION_MINUTES = 20; // Each segment is 20 minutes
      
      // Helper function to calculate total time needed for an order (drive + wait)
      const calculateOrderTime = (order: any): number => {
        const driveTimeMinutes = (order.miles / AVERAGE_SPEED_MPH) * 60;
        return driveTimeMinutes + WAIT_TIME_MINUTES;
      };
      
      // Helper function to check if order can be completed in its segment
      const canCompleteInSegment = (order: any, segment: number, minutes: number): boolean => {
        const segmentStartMinutes = segment * SEGMENT_DURATION_MINUTES;
        const minutesIntoSegment = minutes - segmentStartMinutes;
        const remainingTimeInSegment = SEGMENT_DURATION_MINUTES - minutesIntoSegment;
        const timeNeeded = calculateOrderTime(order);
        return timeNeeded <= remainingTimeInSegment;
      };
      
      // Group orders by hour and segment (each hour divided into 3 segments: 0-20, 20-40, 40-60 minutes)
      // Use timezone-aware hour and minute extraction
      const hourSegmentMap = new Map<string, any[]>(); // Key: "hour:segment"
      
      dateRangeOrders.forEach((order) => {
        const date = new Date(order.processedAt);
        const hour = getHourInTimezone(date, timezone);
        const minutes = getMinutesInTimezone(date, timezone);
        
        // Determine segment: 0-19 = segment 0, 20-39 = segment 1, 40-59 = segment 2
        const segment = Math.floor(minutes / 20);
        const key = `${hour}:${segment}`;
        
        // Only include order if it can be completed within its segment
        if (canCompleteInSegment(order, segment, minutes)) {
          if (!hourSegmentMap.has(key)) {
            hourSegmentMap.set(key, []);
          }
          hourSegmentMap.get(key)!.push(order);
        }
      });

      // For each hour, find best order in each segment, then take top 3 across segments
      const bestOrdersByHour: Array<{
        hour: number;
        orders: Array<{
          id: string;
          restaurantName: string;
          money: number;
          miles: number;
          milesToMoneyRatio: number;
          appName: string;
          processedAt: string;
          estimatedCompletionTime?: number;
        }>;
        worstOrders: Array<{
          id: string;
          restaurantName: string;
          money: number;
          miles: number;
          milesToMoneyRatio: number;
          appName: string;
          processedAt: string;
          estimatedCompletionTime?: number;
        }>;
        totalPotentialEarnings: number;
        worstCaseEarnings: number;
        orderVolume: number;
      }> = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourOrders: any[] = [];
        const allHourOrders: any[] = []; // All orders in this hour for worst case calculation
        let totalOrderVolume = 0;
        
        // Get best order from each segment (0, 1, 2) and count all orders in that hour
        for (let segment = 0; segment < 3; segment++) {
          const key = `${hour}:${segment}`;
          const segmentOrders = hourSegmentMap.get(key) || [];
          
          // Count all orders in this segment
          totalOrderVolume += segmentOrders.length;
          
          // Add all orders to allHourOrders for worst case calculation
          allHourOrders.push(...segmentOrders);
          
          if (segmentOrders.length > 0) {
            // Sort by milesToMoneyRatio descending and take the best one
            // Filter out orders without milesToMoneyRatio before sorting
            const ordersWithRatio = segmentOrders.filter((o) => o.milesToMoneyRatio !== undefined);
            if (ordersWithRatio.length > 0) {
              const sorted = [...ordersWithRatio].sort((a, b) => (b.milesToMoneyRatio || 0) - (a.milesToMoneyRatio || 0));
              hourOrders.push(sorted[0]);
            }
          }
        }
        
        // Helper function to check if orders can be completed sequentially within the hour
        const canCompleteOrdersSequentially = (orders: any[]): any[] => {
          if (orders.length === 0) return [];
          
          // Sort orders by when they appeared (processedAt)
          const sortedByTime = [...orders].sort((a, b) => {
            const dateA = new Date(a.processedAt);
            const dateB = new Date(b.processedAt);
            return dateA.getTime() - dateB.getTime();
          });
          
          const feasibleOrders: any[] = [];
          let currentTime = 0; // Minutes from start of hour
          
          for (const order of sortedByTime) {
            const orderDate = new Date(order.processedAt);
            const orderMinutes = getMinutesInTimezone(orderDate, timezone);
            const orderStartTime = orderMinutes; // Minutes from start of hour
            
            // If order starts before current time, use current time (we're already past it)
            const actualStartTime = Math.max(currentTime, orderStartTime);
            
            // Check if we can complete this order before the hour ends
            const timeNeeded = calculateOrderTime(order);
            const completionTime = actualStartTime + timeNeeded;
            
            if (completionTime <= 60) { // Can complete within the hour
              feasibleOrders.push(order);
              currentTime = completionTime;
            }
          }
          
          return feasibleOrders;
        };
        
        // If we have orders for this hour, sort all segment bests and take top 3
        if (hourOrders.length > 0) {
          // Sort all segment bests by milesToMoneyRatio descending
          const sortedHourOrders = hourOrders.sort((a, b) => (b.milesToMoneyRatio || 0) - (a.milesToMoneyRatio || 0));
          
          // Try to get top 3, but only include those that can be completed sequentially
          const candidateOrders = sortedHourOrders.slice(0, 3);
          const top3Orders = canCompleteOrdersSequentially(candidateOrders).slice(0, 3);
          
          const totalPotentialEarnings = top3Orders.reduce((sum, order) => sum + (order.money || 0), 0);
          
          // Calculate worst case earnings: sum of worst 3 orders by milesToMoneyRatio that can be completed
          const sortedAllOrders = [...allHourOrders].sort((a, b) => a.milesToMoneyRatio - b.milesToMoneyRatio);
          const candidateWorstOrders = sortedAllOrders.slice(0, 3);
          const worst3Orders = canCompleteOrdersSequentially(candidateWorstOrders).slice(0, 3);
          const worstCaseEarnings = worst3Orders.reduce((sum, order) => sum + (order.money || 0), 0);
          
          bestOrdersByHour.push({
            hour,
            orders: top3Orders
              .filter((order) => order.milesToMoneyRatio !== undefined)
              .map((order) => {
                const orderId = order._id.toString();
                // Check if there's an actual linked transaction (not just matching)
                const orderTransactions = orderIdToTransactions.get(orderId) || [];
                const isAccepted = orderTransactions.length > 0;
                const estimatedCompletionTime = Math.round(calculateOrderTime(order));
                return {
                  id: orderId,
                  restaurantName: order.restaurantName || "Unknown",
                  money: order.money,
                  miles: order.miles || 0,
                  milesToMoneyRatio: Math.round((order.milesToMoneyRatio || 0) * 100) / 100,
                  appName: order.appName || "Unknown",
                  processedAt: order.processedAt.toISOString(),
                  isAccepted,
                  estimatedCompletionTime,
                };
              }),
            worstOrders: worst3Orders
              .filter((order) => order.milesToMoneyRatio !== undefined)
              .map((order) => {
                const orderId = order._id.toString();
                // Check if there's an actual linked transaction (not just matching)
                const orderTransactions = orderIdToTransactions.get(orderId) || [];
                const isAccepted = orderTransactions.length > 0;
                const estimatedCompletionTime = Math.round(calculateOrderTime(order));
                return {
                  id: orderId,
                  restaurantName: order.restaurantName || "Unknown",
                  money: order.money,
                  miles: order.miles || 0,
                  milesToMoneyRatio: Math.round((order.milesToMoneyRatio || 0) * 100) / 100,
                  appName: order.appName || "Unknown",
                  processedAt: order.processedAt.toISOString(),
                  isAccepted,
                  estimatedCompletionTime,
                };
              }),
            totalPotentialEarnings: Math.round(totalPotentialEarnings * 100) / 100,
            worstCaseEarnings: Math.round(worstCaseEarnings * 100) / 100,
            orderVolume: totalOrderVolume,
          });
        }
      }

      return bestOrdersByHour;
    };

    // Calculate best orders by hour for each of the last 7 days (including today)
    // Only calculate if dayOfWeek filter is applied (same as bestRestaurantByHour)
    const { estDateString } = getCurrentESTAsUTC();
    const bestOrdersByDay: Array<{
      date: string; // YYYY-MM-DD format
      bestOrdersByHour: Array<{
        hour: number;
        orders: Array<{
          id: string;
          restaurantName: string;
          money: number;
          miles: number;
          milesToMoneyRatio: number;
          appName: string;
          processedAt: string;
          estimatedCompletionTime?: number;
        }>;
        worstOrders: Array<{
          id: string;
          restaurantName: string;
          money: number;
          miles: number;
          milesToMoneyRatio: number;
          appName: string;
          processedAt: string;
          estimatedCompletionTime?: number;
        }>;
        totalPotentialEarnings: number;
        worstCaseEarnings: number;
        orderVolume: number;
      }>;
      totalActualEarnings: number;
      totalPotentialEarnings: number;
    }> = [];

    // Always calculate best orders by day (independent of dayOfWeek filter)
    // Best Orders by Hour has its own date tab selector
    const [year, month, day] = estDateString.split("-").map(Number);
    
    // Generate array of dates for last 7 days (today is index 6, 6 days ago is index 0)
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      // Calculate date by subtracting days from today's EST date
      // Work directly with EST date components to avoid timezone confusion
      let targetYear = year;
      let targetMonth = month;
      let targetDay = day - daysAgo;
      
      // Handle day rollover
      while (targetDay < 1) {
        targetMonth -= 1;
        if (targetMonth < 1) {
          targetMonth = 12;
          targetYear -= 1;
        }
        // Get days in the previous month
        const daysInPrevMonth = new Date(targetYear, targetMonth, 0).getDate();
        targetDay += daysInPrevMonth;
      }
      
      const targetDateString = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
      const dayStartEST = parseESTAsUTC(targetDateString, "00:00");
      const dayEndEST = parseESTAsUTC(targetDateString, "23:59");
      
      const dayOrders = orders.filter((order) => {
        const orderDate = new Date(order.processedAt);
        return orderDate >= dayStartEST && orderDate <= dayEndEST;
      });

      const bestOrdersByHour = calculateBestOrdersByHour(dayOrders);
      
      // Calculate actual earnings for the best orders (only for orders that were accepted)
      let totalActualEarnings = 0;
      bestOrdersByHour.forEach((hourData) => {
        hourData.orders.forEach((order) => {
          const orderId = order.id;
          const orderTransactions = orderIdToTransactions.get(orderId) || [];
          const orderEarnings = orderTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
          totalActualEarnings += orderEarnings;
        });
      });
      
      bestOrdersByDay.push({
        date: targetDateString,
        bestOrdersByHour,
        totalActualEarnings: Math.round(totalActualEarnings * 100) / 100,
        totalPotentialEarnings: bestOrdersByHour.reduce((sum, hour) => sum + hour.totalPotentialEarnings, 0),
      });
    }

    // Keep today's data for backward compatibility
    const todayStartEST = parseESTAsUTC(estDateString, "00:00");
    const todayEndEST = parseESTAsUTC(estDateString, "23:59");
    const todayOrders = orders.filter((order) => {
      const orderDate = new Date(order.processedAt);
      return orderDate >= todayStartEST && orderDate <= todayEndEST;
    });
    const bestOrdersByHour = calculateBestOrdersByHour(todayOrders);

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
        bestOrdersByHour,
        bestOrdersByDay,
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

