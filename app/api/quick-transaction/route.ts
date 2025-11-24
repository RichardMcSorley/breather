import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { startOfDay, endOfDay } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, amount, source } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "Missing amount" },
        { status: 400 }
      );
    }

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount)) {
      return NextResponse.json(
        { error: "Amount must be a number" },
        { status: 400 }
      );
    }

    // If amount is 0, skip creating transaction but still return today's earnings
    const shouldCreateTransaction = parsedAmount !== 0;

    // Determine type from amount sign: positive = income, negative = expense
    const transactionType = parsedAmount > 0 ? "income" : "expense";
    const transactionAmount = Math.abs(parsedAmount);

    // Create transaction for today
    const now = new Date();
    const year = now.getFullYear();
    const timeString = now.toTimeString().slice(0, 5); // HH:MM format

    // Create the transaction only if amount is not 0
    if (shouldCreateTransaction) {
      // Build local date to avoid timezone issues (same approach as existing transactions)
      const [hour, minute] = timeString.split(":").map(Number);
      const transactionDate = new Date(
        year,
        now.getMonth(),
        now.getDate(),
        hour,
        minute
      );

      // Create the transaction
      await Transaction.create({
        userId,
        amount: transactionAmount,
        type: transactionType,
        date: transactionDate,
        time: timeString,
        isBill: false,
        tag: source || undefined,
      });
    }

    // Calculate today's earnings
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const todayTransactions = await Transaction.find({
      userId,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
      isBill: false,
    }).lean();

    const todayIncome = todayTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayExpenses = todayTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayNet = todayIncome - todayExpenses;

    return NextResponse.json({
      success: true,
      todayEarnings: todayNet,
      todayIncome,
      todayExpenses,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

