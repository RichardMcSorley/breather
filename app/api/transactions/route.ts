import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";

const buildLocalDate = (date: string, time: string) => {
  if (!date) {
    throw new Error("Missing date");
  }
  const [baseDate] = date.split("T");
  const [year, month, day] = baseDate.split("-").map(Number);
  const [hour, minute] = (time?.split(":").map(Number) ?? [0, 0]);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error("Invalid date value");
  }
  return new Date(
    year,
    month - 1,
    day,
    Number.isNaN(hour) ? 0 : hour,
    Number.isNaN(minute) ? 0 : minute
  );
};

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
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
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
      
      // Format the transaction date as YYYY-MM-DD
      // Since dates are stored with local time components, we need to extract them correctly
      // The date was stored using local time, so we use UTC methods to get the original values
      if (t.date) {
        const dateObj = new Date(t.date);
        // Use UTC methods to avoid server timezone conversion
        // This preserves the date as it was originally stored
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        formatted.date = `${year}-${month}-${day}`;
      }
      
      // Format dueDate as YYYY-MM-DD string to avoid timezone issues
      if (t.dueDate) {
        const dueDateObj = new Date(t.dueDate);
        const year = dueDateObj.getUTCFullYear();
        const month = String(dueDateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dueDateObj.getUTCDate()).padStart(2, '0');
        formatted.dueDate = `${year}-${month}-${day}`;
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
      transactionDate = buildLocalDate(date, time);
    } catch (error) {
      return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
    }

    // Parse dueDate as local date to avoid timezone shifts
    let parsedDueDate: Date | undefined;
    if (dueDate) {
      // If it's in YYYY-MM-DD format, parse it as local date
      const [year, month, day] = dueDate.split('-').map(Number);
      parsedDueDate = new Date(year, month - 1, day);
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

    // Convert to plain object and format dueDate as YYYY-MM-DD string
    const transactionObj = transaction.toObject();
    let formattedDueDate: string | undefined;
    if (transactionObj.dueDate) {
      const dueDateObj = new Date(transactionObj.dueDate);
      const year = dueDateObj.getFullYear();
      const month = String(dueDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dueDateObj.getDate()).padStart(2, '0');
      formattedDueDate = `${year}-${month}-${day}`;
    }

    return NextResponse.json({
      ...transactionObj,
      dueDate: formattedDueDate,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

