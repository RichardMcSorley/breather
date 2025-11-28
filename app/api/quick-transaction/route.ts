/**
 * NOTE: This API route has no references in the codebase but is used externally by the user's mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { startOfDay, endOfDay } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";
import { parseESTAsUTC, getCurrentESTAsUTC, formatDateAsUTC, parseDateOnlyAsUTC } from "@/lib/date-utils";
import { parseFloatSafe } from "@/lib/validation";

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

    const parsedAmount = parseFloatSafe(amount);
    if (parsedAmount === null) {
      return NextResponse.json(
        { error: "Amount must be a valid number" },
        { status: 400 }
      );
    }

    // If amount is 0, skip creating transaction but still return today's earnings
    const shouldCreateTransaction = parsedAmount !== 0;

    // Determine type from amount sign: positive = income, negative = expense
    const transactionType = parsedAmount > 0 ? "income" : "expense";
    const transactionAmount = Math.abs(parsedAmount);

    // Assume user is in EST - convert EST date/time to UTC for storage
    let userDate: Date;
    let timeString: string;
    let estDateString: string;
    
    if (localDate && localTime) {
      // Parse user's local date and time (assumed to be EST) and convert to UTC
      estDateString = localDate;
      timeString = localTime.slice(0, 5); // HH:MM format
      userDate = parseESTAsUTC(localDate, timeString);
    } else {
      // Get current EST time and convert to UTC
      const estNow = getCurrentESTAsUTC();
      estDateString = estNow.estDateString;
      timeString = estNow.timeString;
      userDate = estNow.date;
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

    // Calculate today's earnings using UTC date range (matching dashboard summary API behavior)
    // Parse the date string as UTC to ensure consistency with dashboard
    // The date string represents a calendar date, which we treat as UTC for consistent querying
    const dateForQuery = parseDateOnlyAsUTC(estDateString);
    const todayStart = new Date(dateForQuery);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(dateForQuery);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Get all transactions for today (matching dashboard summary API behavior)
    // Then filter out bills in JavaScript, same as dashboard does
    const allTodayTransactions = await Transaction.find({
      userId,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    }).lean();

    // Filter out bills using same logic as dashboard (!t.isBill)
    const todayTransactions = allTodayTransactions.filter((t) => {
      return !t.isBill;
    });

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

