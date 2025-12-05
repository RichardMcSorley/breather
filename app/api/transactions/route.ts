import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import Transaction from "@/lib/models/Transaction";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateAsUTC, parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { parseFloatSafe, validatePagination, isValidEnum, TRANSACTION_TYPES } from "@/lib/validation";
import { TransactionQuery, FormattedTransaction, TransactionListResponse } from "@/lib/types";
import { attemptAutoLinkTransactionToCustomer, attemptAutoLinkTransactionToOrder } from "@/lib/auto-link-helper";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Ensure models are registered for population
    // In Next.js, models need to be explicitly referenced to be registered
    if (!mongoose.models.DeliveryOrder) {
      // Model should already be registered via import, but ensure it's available
      DeliveryOrder;
    }
    if (!mongoose.models.OcrExport) {
      // Model should already be registered via import, but ensure it's available
      OcrExport;
    }

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
      .populate("linkedOcrExportIds", "customerName customerAddress appName entryId lat lon")
      .populate("linkedDeliveryOrderIds", "restaurantName restaurantAddress appName miles money entryId userLatitude userLongitude userAddress step active")
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
        step: t.step,
        active: t.active,
        stepLog: t.stepLog || [],
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };

      // Add linked customers info if present
      if (t.linkedOcrExportIds && Array.isArray(t.linkedOcrExportIds)) {
        formatted.linkedOcrExports = t.linkedOcrExportIds
          .filter((customer: any) => customer && typeof customer === 'object' && '_id' in customer)
          .map((customer: any) => ({
            id: String(customer._id),
            customerName: customer.customerName,
            customerAddress: customer.customerAddress,
            appName: customer.appName,
            entryId: customer.entryId,
            lat: customer.lat,
            lon: customer.lon,
          }));
      }

      // Add linked delivery orders info if present
      if (t.linkedDeliveryOrderIds && Array.isArray(t.linkedDeliveryOrderIds)) {
        formatted.linkedDeliveryOrders = t.linkedDeliveryOrderIds
          .filter((order: any) => order && typeof order === 'object' && '_id' in order)
          .map((order: any) => ({
            id: String(order._id),
            restaurantName: order.restaurantName,
            restaurantAddress: order.restaurantAddress,
            appName: order.appName,
            miles: order.miles,
            money: order.money,
            entryId: order.entryId,
            userLatitude: order.userLatitude,
            userLongitude: order.userLongitude,
            userAddress: order.userAddress,
          }));
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
    const { amount, type, date, time, isBill, notes, tag, dueDate, step, active } = body;

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

    // Parse date/time as UTC to match edit transaction behavior
    // This treats the incoming date/time as UTC for consistent storage
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
      step: step || "CREATED",
      active: active !== undefined ? active : true,
      stepLog: [{
        fromStep: null,
        toStep: step || "CREATED",
        time: new Date(),
      }],
    });

    // Attempt auto-linking for income transactions
    if (type === "income") {
      try {
        await attemptAutoLinkTransactionToCustomer(transaction, session.user.id);
        await attemptAutoLinkTransactionToOrder(transaction, session.user.id);
      } catch (autoLinkError) {
        // Silently fail auto-linking - don't break transaction creation
        console.error("Auto-linking error:", autoLinkError);
      }
    }

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
      step: transactionObj.step || "CREATED",
      active: transactionObj.active !== undefined ? transactionObj.active : true,
      stepLog: transactionObj.stepLog || [],
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

