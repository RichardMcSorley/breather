import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { processOrderScreenshot } from "@/lib/order-ocr-processor";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!screenshot) {
      return NextResponse.json(
        { error: "Missing screenshot" },
        { status: 400 }
      );
    }

    if (!appName) {
      return NextResponse.json(
        { error: "Missing appName" },
        { status: 400 }
      );
    }

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Process screenshot immediately with Moondream
    try {
      const processed = await processOrderScreenshot(screenshot);

      // Calculate miles to money ratio
      const milesToMoneyRatio = processed.money / processed.miles;

      // Save to delivery orders collection
      const deliveryOrder = await DeliveryOrder.create({
        entryId,
        userId,
        appName,
        miles: processed.miles,
        money: processed.money,
        milesToMoneyRatio,
        restaurantName: processed.restaurantName,
        time: "", // Time not extracted from screenshot, can be updated later
        screenshot: screenshot,
        rawResponse: processed.rawResponse,
        processedAt: new Date(),
      });

      // Build response
      const response = {
        success: true,
        id: deliveryOrder._id.toString(),
        entryId: deliveryOrder.entryId,
        message: "Delivery order processed and saved successfully",
        miles: deliveryOrder.miles,
        money: deliveryOrder.money,
        milesToMoneyRatio: deliveryOrder.milesToMoneyRatio,
        restaurantName: deliveryOrder.restaurantName,
        time: deliveryOrder.time,
        appName: deliveryOrder.appName,
        editLink: `https://breather-chi.vercel.app/delivery-orders?orderId=${deliveryOrder._id.toString()}`,
      };

      return NextResponse.json(response);
    } catch (processError) {
      console.error("Error processing order screenshot:", processError);
      return NextResponse.json(
        {
          error: "Failed to process screenshot",
          details: processError instanceof Error ? processError.message : "Unknown processing error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const filterAmount = searchParams.get("filterAmount");
    const filterAppName = searchParams.get("filterAppName");
    const filterDateTime = searchParams.get("filterDateTime");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const limit = Math.min(100, parseInt(searchParams.get("limit") || "100", 10));

    // Parse filter values
    const filterAmountNum = filterAmount ? parseFloat(filterAmount) : null;
    let filterDate: Date | null = null;
    if (filterDateTime) {
      try {
        filterDate = new Date(filterDateTime);
        if (isNaN(filterDate.getTime())) {
          filterDate = null;
        }
      } catch {
        filterDate = null;
      }
    }

    // Get delivery orders for the user, sorted by most recent first
    let orders = await DeliveryOrder.find({ userId })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    // Apply filters if provided
    if (filterAppName || filterDate || filterAmountNum !== null) {
      orders = orders.filter((order) => {
        // Check appName filter
        if (filterAppName) {
          const orderAppName = (order.appName || "").trim().toLowerCase();
          const filterAppNameLower = filterAppName.trim().toLowerCase();
          if (orderAppName !== filterAppNameLower) {
            return false;
          }
        }

        // Check time filter (within 1 hour)
        if (filterDate) {
          const orderDate = new Date(order.processedAt);
          const timeDiff = Math.abs(filterDate.getTime() - orderDate.getTime());
          const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds
          if (timeDiff > oneHourInMs) {
            return false;
          }
        }

        // Check amount filter (match order's money field)
        if (filterAmountNum !== null) {
          const orderMoneyMatch = Math.abs(order.money - filterAmountNum) < 0.01;
          if (!orderMoneyMatch) {
            return false;
          }
        }

        return true;
      });
    }

    // Get all linked transactions for these orders
    const orderIds = orders.map((o) => o._id);
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
      // Handle array of linked delivery order IDs
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
      orders: orders.map((order) => ({
        id: order._id.toString(),
        entryId: order.entryId,
        appName: order.appName,
        miles: order.miles,
        money: order.money,
        milesToMoneyRatio: order.milesToMoneyRatio,
        restaurantName: order.restaurantName,
        time: order.time,
        screenshot: order.screenshot,
        processedAt: order.processedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
        linkedTransactions: transactionsByOrderId.get(order._id.toString()) || [],
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify the order exists
    const existingOrder = await DeliveryOrder.findById(id).lean();
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const result = await DeliveryOrder.findByIdAndDelete(id);

    if (!result) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { id, appName, miles, money, restaurantName, time } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify the order exists
    const existingOrder = await DeliveryOrder.findById(id).lean();
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const updateSet: Record<string, any> = {};

    if (typeof appName === "string") {
      updateSet.appName = appName;
    }
    if (typeof miles === "number" && miles > 0) {
      updateSet.miles = miles;
    }
    if (typeof money === "number" && money > 0) {
      updateSet.money = money;
    }
    if (typeof restaurantName === "string") {
      updateSet.restaurantName = restaurantName;
    }
    if (typeof time === "string") {
      updateSet.time = time;
    }

    // Recalculate ratio if miles or money changed
    if (updateSet.miles !== undefined || updateSet.money !== undefined) {
      const finalMiles = updateSet.miles ?? existingOrder.miles;
      const finalMoney = updateSet.money ?? existingOrder.money;
      updateSet.milesToMoneyRatio = finalMoney / finalMiles;
    }

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await DeliveryOrder.findByIdAndUpdate(
      id,
      { $set: updateSet },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!result) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        id: result._id.toString(),
        entryId: result.entryId,
        appName: result.appName,
        miles: result.miles,
        money: result.money,
        milesToMoneyRatio: result.milesToMoneyRatio,
        restaurantName: result.restaurantName,
        time: result.time,
        processedAt: result.processedAt.toISOString(),
        createdAt: result.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

