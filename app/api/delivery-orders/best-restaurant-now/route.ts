import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const timezone = searchParams.get("timezone") || "America/New_York";
    const currentHour = searchParams.get("hour") ? parseInt(searchParams.get("hour")!, 10) : new Date().getHours();
    const currentDayOfWeek = searchParams.get("dayOfWeek") ? parseInt(searchParams.get("dayOfWeek")!, 10) : new Date().getDay();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Helper function to get day of week in timezone
    const getDayOfWeekInTimezone = (utcDate: Date, tz: string): number => {
      const year = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(utcDate), 10);
      const month = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(utcDate), 10) - 1;
      const day = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(utcDate), 10);
      const dateInTz = new Date(year, month, day);
      return dateInTz.getDay();
    };

    // Helper function to get hour in timezone
    const getHourInTimezone = (utcDate: Date, tz: string): number => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      });
      return parseInt(formatter.format(utcDate), 10);
    };

    // Helper function to calculate median
    const calculateMedian = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    // Get all delivery orders for the user from this year
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    let orders = await DeliveryOrder.find({
      userId,
      processedAt: { $gte: startOfYear },
    })
      .sort({ processedAt: -1 })
      .lean();

    // Filter to only include DoorDash (Dasher) or GrubHub (GH Drivers) orders
    // Match the exact app names as they appear in the codebase: "Dasher" and "GH Drivers"
    const allowedApps = ["dasher", "gh drivers"];
    const originalOrderCount = orders.length;
    const uniqueAppsBeforeFilter = [...new Set(orders.map((o: any) => o.appName))];
    orders = orders.filter((order) => {
      const appName = (order.appName || "").toLowerCase().trim();
      return allowedApps.includes(appName);
    });
    
    // Debug: Log filtering results (remove after verification)
    if (orders.length === 0 && originalOrderCount > 0) {
      console.log(`[best-restaurant-now] Filtered ${originalOrderCount} orders to ${orders.length}. Unique apps before filter: ${uniqueAppsBeforeFilter.join(", ")}`);
    }

    // Filter by day of week (0 = Sunday, 6 = Saturday)
    if (currentDayOfWeek !== null && !isNaN(currentDayOfWeek) && currentDayOfWeek >= 0 && currentDayOfWeek <= 6) {
      orders = orders.filter((order) => {
        const orderDate = new Date(order.processedAt);
        const orderDayOfWeek = getDayOfWeekInTimezone(orderDate, timezone);
        return orderDayOfWeek === currentDayOfWeek;
      });
    }

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        bestRestaurant: null,
      });
    }

    // Calculate best restaurant per hour (highest combined score in that hour)
    const hourRestaurantMap = new Map<string, any>(); // Key: "hour:restaurantName"
    orders.forEach((order) => {
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
        hourRestaurantData.acceptedRatios.push(order.milesToMoneyRatio);
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

    // Find best restaurant for the current hour, or nearest hour with data
    let bestRestaurant = null;
    
    // First, try to find exact hour match
    const currentHourScores = hourRestaurantScores.filter((item) => item.hour === currentHour);
    if (currentHourScores.length > 0) {
      const best = currentHourScores.reduce((best, current) =>
        current.combinedScore > best.combinedScore ? current : best
      );
      bestRestaurant = {
        hour: best.hour,
        restaurantName: best.restaurantName,
        medianRatio: best.medianRatio,
        volume: best.volume,
      };
    } else {
      // Find the nearest hour with data
      if (hourRestaurantScores.length > 0) {
        let closestHour = hourRestaurantScores[0];
        let minDistance = Math.abs(hourRestaurantScores[0].hour - currentHour);
        
        for (const item of hourRestaurantScores) {
          const distance = Math.abs(item.hour - currentHour);
          if (distance < minDistance) {
            minDistance = distance;
            closestHour = item;
          }
        }
        
        // Get all restaurants for the closest hour and find the best one
        const closestHourScores = hourRestaurantScores.filter((item) => item.hour === closestHour.hour);
        if (closestHourScores.length > 0) {
          const best = closestHourScores.reduce((best, current) =>
            current.combinedScore > best.combinedScore ? current : best
          );
          bestRestaurant = {
            hour: best.hour,
            restaurantName: best.restaurantName,
            medianRatio: best.medianRatio,
            volume: best.volume,
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      bestRestaurant,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

