import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { processOrderScreenshot } from "@/lib/order-ocr-processor";
import { randomBytes } from "crypto";
import { attemptAutoLinkOrderToTransaction } from "@/lib/auto-link-helper";
import { getCurrentESTAsUTC } from "@/lib/date-utils";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, screenshot, appName, ocrText, lat, lon, alt, address } = body;

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
      const processed = await processOrderScreenshot(screenshot, ocrText);

      // Calculate miles to money ratio (only if miles is provided and > 0)
      const milesToMoneyRatio = processed.miles && processed.miles > 0 
        ? processed.money / processed.miles 
        : undefined;

      // Get current EST time and convert to UTC (matches transaction log timezone logic)
      const { date: processedAtDate } = getCurrentESTAsUTC();

      // Save to delivery orders collection
      const deliveryOrder = await DeliveryOrder.create({
        entryId,
        userId,
        appName,
        ...(processed.miles !== undefined && processed.miles !== null && { miles: processed.miles }),
        money: processed.money,
        ...(milesToMoneyRatio !== undefined && { milesToMoneyRatio }),
        restaurantName: processed.restaurantName,
        time: "", // Time not extracted from screenshot, can be updated later
        rawResponse: processed.rawResponse,
        metadata: processed.metadata,
        processedAt: processedAtDate,
        step: "CREATED",
        active: true,
        ...(lat !== undefined && lat !== null && { userLatitude: lat }),
        ...(lon !== undefined && lon !== null && { userLongitude: lon }),
        ...(alt !== undefined && alt !== null && { userAltitude: alt }),
        ...(address !== undefined && address !== null && { userAddress: address }),
      });

      // Attempt auto-linking to matching transaction
      try {
        await attemptAutoLinkOrderToTransaction(deliveryOrder, userId);
      } catch (autoLinkError) {
        // Silently fail auto-linking - don't break order creation
        console.error("Auto-linking error:", autoLinkError);
      }

      // Build response
      const milesText = deliveryOrder.miles !== undefined ? `${deliveryOrder.miles} mi` : "? mi";
      const ratioText = deliveryOrder.milesToMoneyRatio !== undefined 
        ? `$${deliveryOrder.milesToMoneyRatio.toFixed(2)}/mi - ` 
        : "";
      
      const response = {
        success: true,
        id: deliveryOrder._id.toString(),
        entryId: deliveryOrder.entryId,
        message: "Delivery order processed and saved successfully",
        ...(deliveryOrder.miles !== undefined && { miles: deliveryOrder.miles }),
        money: deliveryOrder.money,
        ...(deliveryOrder.milesToMoneyRatio !== undefined && { milesToMoneyRatio: deliveryOrder.milesToMoneyRatio }),
        restaurantName: deliveryOrder.restaurantName,
        time: deliveryOrder.time,
        appName: deliveryOrder.appName,
        displayText: `${ratioText}${milesText} for $${deliveryOrder.money} at ${deliveryOrder.restaurantName}`,
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
    const id = searchParams.get("id");
    const filterAmount = searchParams.get("filterAmount");
    const filterAppName = searchParams.get("filterAppName");
    const searchQuery = searchParams.get("search");

    // If id is provided, fetch a single order
    if (id) {
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      }

      const order = await DeliveryOrder.findOne({ _id: id, userId }).lean();
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      // Get linked transactions for this order
      const linkedTransactions = await Transaction.find({
        userId,
        linkedDeliveryOrderIds: { $in: [order._id] },
        type: "income",
      })
        .sort({ date: -1 })
        .lean();

      const transactions = linkedTransactions.map((t) => ({
        _id: t._id.toString(),
        amount: t.amount,
        date: t.date,
        tag: t.tag,
        notes: t.notes,
      }));

      return NextResponse.json({
        success: true,
        order: {
          id: order._id.toString(),
          entryId: order.entryId,
          appName: order.appName,
          miles: order.miles,
          money: order.money,
          milesToMoneyRatio: order.milesToMoneyRatio,
          restaurantName: order.restaurantName,
          restaurantAddress: order.restaurantAddress,
          restaurantPlaceId: order.restaurantPlaceId,
          restaurantLat: order.restaurantLat,
          restaurantLon: order.restaurantLon,
          time: order.time,
          screenshot: order.screenshot,
          metadata: order.metadata,
          userLatitude: order.userLatitude,
          userLongitude: order.userLongitude,
          userAltitude: order.userAltitude,
          userAddress: order.userAddress,
          step: order.step || "CREATED",
          active: order.active,
          processedAt: order.processedAt.toISOString(),
          createdAt: order.createdAt.toISOString(),
          linkedTransactions: transactions,
          additionalRestaurants: order.additionalRestaurants || [],
        },
      });
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Parse pagination parameters
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || "25", 10)));
    const skip = (page - 1) * limit;

    // Parse filter values
    const filterAmountNum = filterAmount ? parseFloat(filterAmount) : null;

    // Get all delivery orders for the user (before filtering and pagination)
    let orders = await DeliveryOrder.find({ userId })
      .sort({ processedAt: -1 })
      .lean();

    // Apply filters if provided
    if (filterAppName || filterAmountNum !== null) {
      orders = orders.filter((order) => {
        // Check appName filter
        if (filterAppName) {
          const orderAppName = (order.appName || "").trim().toLowerCase();
          const filterAppNameLower = filterAppName.trim().toLowerCase();
          if (orderAppName !== filterAppNameLower) {
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

    // Apply search filter if provided (search by restaurant name, address, or pay amount)
    // Support multi-term search: split by spaces, all terms must match (AND logic)
    if (searchQuery && searchQuery.trim()) {
      const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
      
      if (searchTerms.length > 0) {
        orders = orders.filter((order) => {
          // All search terms must match (AND logic)
          return searchTerms.every((term) => {
            const termLower = term.toLowerCase();
            // Try to parse as a number for amount search
            const termAsNumber = parseFloat(termLower);
            const isNumericSearch = !isNaN(termAsNumber) && isFinite(termAsNumber);
            
            // Each term can match in any field (OR logic within term)
            // Search by pay amount (money field) if term is numeric
            if (isNumericSearch && order.money != null) {
              // Match if the order's money field equals the search amount (with tolerance for floating point)
              if (Math.abs(order.money - termAsNumber) < 0.01) {
                return true;
              }
            }
            
            // Search in main restaurant name
            if (order.restaurantName && order.restaurantName.toLowerCase().includes(termLower)) {
              return true;
            }
            // Search in main restaurant address
            if (order.restaurantAddress && order.restaurantAddress.toLowerCase().includes(termLower)) {
              return true;
            }
            // Search in additional restaurants
            if (order.additionalRestaurants && Array.isArray(order.additionalRestaurants)) {
              for (const additionalRestaurant of order.additionalRestaurants) {
                if (additionalRestaurant.name && additionalRestaurant.name.toLowerCase().includes(termLower)) {
                  return true;
                }
                if (additionalRestaurant.address && additionalRestaurant.address.toLowerCase().includes(termLower)) {
                  return true;
                }
              }
            }
            return false;
          });
        });
      }
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

    // Calculate total after all filtering (filters and search)
    const total = orders.length;

    // Apply pagination
    const paginatedOrders = orders.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      orders: paginatedOrders.map((order) => ({
        id: order._id.toString(),
        entryId: order.entryId,
        appName: order.appName,
        miles: order.miles,
        money: order.money,
        milesToMoneyRatio: order.milesToMoneyRatio,
        restaurantName: order.restaurantName,
        restaurantAddress: order.restaurantAddress,
        restaurantPlaceId: order.restaurantPlaceId,
        restaurantLat: order.restaurantLat,
        restaurantLon: order.restaurantLon,
        time: order.time,
        screenshot: order.screenshot,
        metadata: order.metadata,
        userLatitude: order.userLatitude,
        userLongitude: order.userLongitude,
        userAltitude: order.userAltitude,
        userAddress: order.userAddress,
        step: order.step || "CREATED",
        active: order.active !== undefined ? order.active : true,
        processedAt: order.processedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
        linkedTransactions: transactionsByOrderId.get(order._id.toString()) || [],
        additionalRestaurants: order.additionalRestaurants || [],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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
    const { id, appName, miles, money, restaurantName, restaurantAddress, restaurantPlaceId, restaurantLat, restaurantLon, time, step, additionalRestaurants, updateAdditionalRestaurant } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify the order exists
    const existingOrder = await DeliveryOrder.findById(id);
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
    if (typeof restaurantAddress === "string") {
      updateSet.restaurantAddress = restaurantAddress;
    }
    if (typeof restaurantPlaceId === "string") {
      updateSet.restaurantPlaceId = restaurantPlaceId;
    }
    if (typeof restaurantLat === "number") {
      updateSet.restaurantLat = restaurantLat;
    }
    if (typeof restaurantLon === "number") {
      updateSet.restaurantLon = restaurantLon;
    }
    if (typeof time === "string") {
      updateSet.time = time;
    }
    if (typeof step === "string") {
      updateSet.step = step;
    }
    if (Array.isArray(additionalRestaurants)) {
      updateSet.additionalRestaurants = additionalRestaurants;
    }
    // Support updating a single additional restaurant by index
    if (updateAdditionalRestaurant && typeof updateAdditionalRestaurant.index === "number" && updateAdditionalRestaurant.data) {
      const index = updateAdditionalRestaurant.index;
      const restaurantData = updateAdditionalRestaurant.data;
      if (!existingOrder.additionalRestaurants) {
        existingOrder.additionalRestaurants = [];
      }
      if (index >= 0 && index < existingOrder.additionalRestaurants.length) {
        existingOrder.additionalRestaurants[index] = {
          ...existingOrder.additionalRestaurants[index],
          ...restaurantData,
        };
        updateSet.additionalRestaurants = existingOrder.additionalRestaurants;
      }
    }

    // Recalculate ratio if miles or money changed
    if (updateSet.miles !== undefined || updateSet.money !== undefined) {
      const finalMiles = updateSet.miles ?? existingOrder.miles;
      const finalMoney = updateSet.money ?? existingOrder.money;
      if (finalMiles !== undefined && finalMiles !== null && finalMiles > 0) {
        updateSet.milesToMoneyRatio = finalMoney / finalMiles;
      } else {
        // If miles is 0 or undefined, remove the ratio
        updateSet.milesToMoneyRatio = undefined;
      }
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
        restaurantAddress: result.restaurantAddress,
        restaurantPlaceId: result.restaurantPlaceId,
        restaurantLat: result.restaurantLat,
        restaurantLon: result.restaurantLon,
        time: result.time,
        step: result.step || "CREATED",
        active: result.active !== undefined ? result.active : true,
        processedAt: result.processedAt.toISOString(),
        createdAt: result.createdAt.toISOString(),
        additionalRestaurants: result.additionalRestaurants || [],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

