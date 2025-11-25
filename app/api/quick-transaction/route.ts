import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { startOfDay, endOfDay } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";
import { parseESTAsUTC, getCurrentESTAsUTC, formatDateAsUTC } from "@/lib/date-utils";

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

    // Calculate today's earnings using EST timezone
    // Parse EST date string to get start/end of day in EST, then convert to UTC
    const estStartDate = parseESTAsUTC(estDateString, "00:00");
    const estEndDate = parseESTAsUTC(estDateString, "23:59");
    // Set to end of day (23:59:59.999)
    estEndDate.setUTCSeconds(59, 999);
    
    const todayStart = estStartDate;
    const todayEnd = estEndDate;

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

