import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
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
        time: processed.time,
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

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const limit = Math.min(100, parseInt(searchParams.get("limit") || "100", 10));

    // Get delivery orders for the user, sorted by most recent first
    const orders = await DeliveryOrder.find({ userId })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

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
        processedAt: order.processedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
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

