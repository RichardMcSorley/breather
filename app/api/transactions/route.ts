import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateAsUTC, parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");
    const tag = searchParams.get("tag");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const query: any = { userId: session.user.id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = parseDateOnlyAsUTC(startDate);
      if (endDate) {
        // For end date, include the entire day (end of day in UTC)
        const endDateUTC = parseDateOnlyAsUTC(endDate);
        endDateUTC.setUTCHours(23, 59, 59, 999);
        query.date.$lte = endDateUTC;
      }
    }

    if (type) {
      query.type = type;
    }

    if (tag) {
      query.tag = tag;
    }

    const transactions = await Transaction.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Format dates as YYYY-MM-DD strings to avoid timezone issues
    const formattedTransactions = transactions.map((t: any) => {
      const formatted: any = { ...t };
      
      // Format the transaction date as YYYY-MM-DD using UTC
      if (t.date) {
        formatted.date = formatDateAsUTC(new Date(t.date));
      }
      
      // Format dueDate as YYYY-MM-DD string using UTC
      if (t.dueDate) {
        formatted.dueDate = formatDateAsUTC(new Date(t.dueDate));
      }
      
      return formatted;
    });

    const total = await Transaction.countDocuments(query);

    return NextResponse.json({
      transactions: formattedTransactions,
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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { amount, type, date, time, isBill, notes, tag, dueDate } = body;

    if (!amount || !type || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let transactionDate: Date;
    try {
      transactionDate = parseDateAsUTC(date, time);
    } catch (error) {
      return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
    }

    // Parse dueDate as UTC date
    let parsedDueDate: Date | undefined;
    if (dueDate) {
      try {
        parsedDueDate = parseDateOnlyAsUTC(dueDate);
      } catch (error) {
        return NextResponse.json({ error: "Invalid dueDate format" }, { status: 400 });
      }
    }

    const transaction = await Transaction.create({
      userId: session.user.id,
      amount: parseFloat(amount),
      type,
      date: transactionDate,
      time,
      isBill: isBill || false,
      notes,
      tag,
      dueDate: parsedDueDate,
    });

    // Convert to plain object and format dates as YYYY-MM-DD strings using UTC
    const transactionObj = transaction.toObject();
    let formattedDate: string | undefined;
    if (transactionObj.date) {
      formattedDate = formatDateAsUTC(new Date(transactionObj.date));
    }
    
    let formattedDueDate: string | undefined;
    if (transactionObj.dueDate) {
      formattedDueDate = formatDateAsUTC(new Date(transactionObj.dueDate));
    }

    return NextResponse.json({
      ...transactionObj,
      date: formattedDate || transactionObj.date,
      dueDate: formattedDueDate,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

