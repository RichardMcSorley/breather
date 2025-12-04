import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const query = searchParams.get("query");
    const filterAppName = searchParams.get("filterAppName");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!query || query.trim() === "") {
      return NextResponse.json({ error: "Missing or empty search query" }, { status: 400 });
    }

    const searchQuery = query.trim().toLowerCase();
    const limit = 100; // Return first 100 matching results

    // Build the base query
    const baseQuery: any = { userId };

    // If filterAppName is provided, add it to the query
    if (filterAppName && filterAppName.trim() !== "") {
      baseQuery.appName = { $regex: new RegExp(`^${filterAppName.trim()}$`, "i") };
    }

    // Get delivery orders matching the base query, sorted by most recent first
    let orders = await DeliveryOrder.find(baseQuery)
      .sort({ processedAt: -1 })
      .lean();

    // Filter by search query (app name or restaurant name)
    const filteredOrders = orders.filter((order) => {
      const appName = (order.appName || "").toLowerCase();
      const restaurantName = (order.restaurantName || "").toLowerCase();
      return appName.includes(searchQuery) || restaurantName.includes(searchQuery);
    });

    // Limit to first 100 results
    const limitedOrders = filteredOrders.slice(0, limit);

    // Get all linked transactions for these orders
    const orderIds = limitedOrders.map((o) => o._id);
    const linkedTransactions = await Transaction.find({
      userId,
      linkedDeliveryOrderIds: { $in: orderIds },
      type: "income",
    })
      .sort({ date: -1 })
      .lean();

    // Create a map of order ID to linked transactions
    const transactionsByOrderId = new Map<string, any[]>();
    linkedTransactions.forEach((t) => {
      const orderIds = t.linkedDeliveryOrderIds || [];
      if (Array.isArray(orderIds)) {
        orderIds.forEach((orderIdObj) => {
          const orderId = orderIdObj?.toString();
          if (orderId) {
            if (!transactionsByOrderId.has(orderId)) {
              transactionsByOrderId.set(orderId, []);
            }
            transactionsByOrderId.get(orderId)!.push({
              _id: t._id.toString(),
              amount: t.amount,
              date: t.date,
              tag: t.tag,
              notes: t.notes,
            });
          }
        });
      }
    });

    return NextResponse.json({
      success: true,
      orders: limitedOrders.map((order) => ({
        id: order._id.toString(),
        entryId: order.entryId,
        appName: order.appName,
        miles: order.miles,
        money: order.money,
        milesToMoneyRatio: order.milesToMoneyRatio,
        restaurantName: order.restaurantName,
        time: order.time,
        screenshot: order.screenshot,
        metadata: order.metadata,
        userLatitude: order.userLatitude,
        userLongitude: order.userLongitude,
        userAltitude: order.userAltitude,
        userAddress: order.userAddress,
        processedAt: order.processedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
        linkedTransactions: transactionsByOrderId.get(order._id.toString()) || [],
      })),
      totalMatches: filteredOrders.length,
      returnedCount: limitedOrders.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

