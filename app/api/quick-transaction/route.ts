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

    // Convert server time to EST (UTC-5) for all date calculations
    // EST is UTC-5, EDT (daylight saving) is UTC-4
    // For simplicity, we'll use UTC-5 (EST) - adjust if EDT is needed
    const EST_OFFSET_HOURS = 5;
    const now = new Date();
    
    // Get UTC components and convert to EST
    let estYear = now.getUTCFullYear();
    let estMonth = now.getUTCMonth();
    let estDay = now.getUTCDate();
    let estHour = now.getUTCHours() - EST_OFFSET_HOURS;
    const estMinute = now.getUTCMinutes();
    
    // Handle day/hour rollover when subtracting hours
    if (estHour < 0) {
      estHour += 24;
      estDay -= 1;
      if (estDay < 1) {
        estMonth -= 1;
        if (estMonth < 0) {
          estMonth = 11;
          estYear -= 1;
        }
        // Get days in previous month
        const daysInPrevMonth = new Date(estYear, estMonth + 1, 0).getDate();
        estDay = daysInPrevMonth;
      }
    }
    
    let userDate: Date;
    let timeString: string;
    
    if (localDate && localTime) {
      // Parse user's local date and time (assumed to be EST)
      const [year, month, day] = localDate.split("-").map(Number);
      const [hour, minute] = localTime.split(":").map(Number);
      userDate = new Date(year, month - 1, day, hour, minute);
      timeString = localTime.slice(0, 5); // HH:MM format
    } else {
      // Use EST time for transaction
      timeString = `${String(estHour).padStart(2, '0')}:${String(estMinute).padStart(2, '0')}`;
      userDate = new Date(estYear, estMonth, estDay, estHour, estMinute);
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
    // Use EST date for day boundaries
    let estDateForBoundaries: Date;
    if (localDate && localTime) {
      estDateForBoundaries = userDate;
    } else {
      estDateForBoundaries = new Date(estYear, estMonth, estDay);
    }
    
    const todayStart = startOfDay(estDateForBoundaries);
    const todayEnd = endOfDay(estDateForBoundaries);

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

