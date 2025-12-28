import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseESTAsUTC, getCurrentESTAsUTC } from "@/lib/date-utils";

/**
 * API endpoint to create a transaction from a delivery order and link them
 * Used by iOS Shortcuts to log an order as income
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id: orderId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    // Find the order
    const order = await DeliveryOrder.findOne({ _id: orderId, userId });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check if already linked to a transaction
    if (order.linkedTransactionIds && order.linkedTransactionIds.length > 0) {
      return NextResponse.json(
        { error: "Order already linked to a transaction" },
        { status: 400 }
      );
    }

    // Extract date/time from order's processedAt (convert UTC to EST)
    let transactionDate: string;
    let transactionTime: string;

    if (order.processedAt) {
      const processedDate = new Date(order.processedAt);
      // Subtract 5 hours for EST
      const estDate = new Date(processedDate.getTime() - 5 * 60 * 60 * 1000);
      transactionDate = estDate.toISOString().split("T")[0];
      transactionTime = estDate.toTimeString().slice(0, 5);
    } else {
      // Fallback to current time in EST
      const now = new Date();
      const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      transactionDate = estNow.toISOString().split("T")[0];
      transactionTime = estNow.toTimeString().slice(0, 5);
    }

    // Create the transaction
    const transaction = await Transaction.create({
      userId,
      amount: order.money || 0,
      type: "income",
      date: transactionDate,
      time: transactionTime,
      notes: "",
      tag: order.appName || "",
      step: "CREATED",
      active: true,
      linkedDeliveryOrderIds: [order._id],
    });

    // Link the order to the transaction
    order.linkedTransactionIds = [transaction._id];
    await order.save();

    // Calculate today's earnings
    const { estDateString } = getCurrentESTAsUTC();
    const estStartDate = parseESTAsUTC(estDateString, "00:00");
    const estEndDate = parseESTAsUTC(estDateString, "23:59");
    estEndDate.setUTCSeconds(59, 999);

    const allTodayTransactions = await Transaction.find({
      userId,
      date: {
        $gte: estStartDate,
        $lte: estEndDate,
      },
    }).lean();

    // Filter out bills
    const todayTransactions = allTodayTransactions.filter((t) => !t.isBill);

    const todayIncome = todayTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayExpenses = todayTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayNet = todayIncome - todayExpenses;

    return NextResponse.json({
      success: true,
      transactionId: transaction._id.toString(),
      orderId: order._id.toString(),
      amount: transaction.amount,
      date: transactionDate,
      time: transactionTime,
      tag: transaction.tag,
      restaurantName: order.restaurantName,
      todayEarnings: todayNet,
      todayIncome,
      todayExpenses,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
