import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateAsUTC, parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { parseFloatSafe, validatePagination, isValidEnum, TRANSACTION_TYPES } from "@/lib/validation";
import { TransactionQuery, FormattedTransaction, TransactionListResponse } from "@/lib/types";

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
    
    const pagination = validatePagination(
      searchParams.get("page"),
      searchParams.get("limit")
    );
    if (!pagination) {
      return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
    }
    const { page, limit } = pagination;

    const query: TransactionQuery = { userId: session.user.id };

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
      if (!isValidEnum(type, TRANSACTION_TYPES)) {
        return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
      }
      query.type = type;
    }

    if (tag) {
      query.tag = tag;
    }

    const transactions = await Transaction.find(query)
      .populate("linkedOcrExportId", "customerName customerAddress appName entryId")
      .populate("linkedDeliveryOrderId", "restaurantName appName miles money entryId")
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Format dates as YYYY-MM-DD strings to avoid timezone issues
    const formattedTransactions: FormattedTransaction[] = transactions.map((t: any) => {
      const formatted: any = {
        ...t,
        _id: t._id.toString(),
        date: t.date ? formatDateAsUTC(new Date(t.date)) : "",
        dueDate: t.dueDate ? formatDateAsUTC(new Date(t.dueDate)) : undefined,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };

      // Add linked customer info if present
      if (t.linkedOcrExportId && typeof t.linkedOcrExportId === 'object') {
        formatted.linkedOcrExport = {
          id: String(t.linkedOcrExportId._id),
          customerName: t.linkedOcrExportId.customerName,
          customerAddress: t.linkedOcrExportId.customerAddress,
          appName: t.linkedOcrExportId.appName,
          entryId: t.linkedOcrExportId.entryId,
        };
      }

      // Add linked delivery order info if present
      if (t.linkedDeliveryOrderId && typeof t.linkedDeliveryOrderId === 'object') {
        formatted.linkedDeliveryOrder = {
          id: String(t.linkedDeliveryOrderId._id),
          restaurantName: t.linkedDeliveryOrderId.restaurantName,
          appName: t.linkedDeliveryOrderId.appName,
          miles: t.linkedDeliveryOrderId.miles,
          money: t.linkedDeliveryOrderId.money,
          entryId: t.linkedDeliveryOrderId.entryId,
        };
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

    const parsedAmount = parseFloatSafe(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!isValidEnum(type, TRANSACTION_TYPES)) {
      return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
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
      amount: parsedAmount,
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

