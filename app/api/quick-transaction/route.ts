import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { startOfDay, endOfDay } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { userId, amount, source, localDate, localTime } = body;

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

    // Use client's local date/time if provided, otherwise use server's current time
    let userDate: Date;
    let timeString: string;
    
    if (localDate && localTime) {
      // Parse user's local date and time
      const [year, month, day] = localDate.split("-").map(Number);
      const [hour, minute] = localTime.split(":").map(Number);
      userDate = new Date(year, month - 1, day, hour, minute);
      timeString = localTime.slice(0, 5); // HH:MM format
    } else {
      // Fallback to server time (for backward compatibility)
      const now = new Date();
      const year = now.getFullYear();
      timeString = now.toTimeString().slice(0, 5); // HH:MM format
      const [hour, minute] = timeString.split(":").map(Number);
      userDate = new Date(
        year,
        now.getMonth(),
        now.getDate(),
        hour,
        minute
      );
    }

    // Create the transaction only if amount is not 0
    if (shouldCreateTransaction) {
      // Create the transaction with user's local date/time
      await Transaction.create({
        userId,
        amount: transactionAmount,
        type: transactionType,
        date: userDate,
        time: timeString,
        isBill: false,
        tag: source || undefined,
      });
    }

    // Calculate today's earnings using user's local date
    // Extract just the date part (without time) to get start/end of day in user's timezone
    const userLocalDate = new Date(
      userDate.getFullYear(),
      userDate.getMonth(),
      userDate.getDate()
    );
    const todayStart = startOfDay(userLocalDate);
    const todayEnd = endOfDay(userLocalDate);

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

