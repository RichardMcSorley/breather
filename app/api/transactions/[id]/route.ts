import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateAsUTC, parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { isValidObjectId, parseFloatSafe, isValidEnum, TRANSACTION_TYPES } from "@/lib/validation";
import { TransactionResponse } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    // Populate linked entities
    const transaction = await Transaction.findOne({
      _id: id,
      userId: session.user.id,
    })
      .populate("linkedOcrExportIds", "customerName customerAddress appName entryId")
      .populate("linkedDeliveryOrderIds", "restaurantName appName miles money entryId userLatitude userLongitude userAddress")
      .lean();

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Format dates as YYYY-MM-DD strings using UTC
    const transactionObj: any = {
      _id: String(transaction._id),
      userId: transaction.userId,
      amount: transaction.amount,
      type: transaction.type,
      date: transaction.date ? formatDateAsUTC(new Date(transaction.date)) : "",
      time: transaction.time,
      isBill: transaction.isBill,
      isBalanceAdjustment: transaction.isBalanceAdjustment,
      notes: transaction.notes,
      tag: transaction.tag,
      dueDate: transaction.dueDate ? formatDateAsUTC(new Date(transaction.dueDate)) : undefined,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };

    // Add linked customers info if present
    if (transaction.linkedOcrExportIds && Array.isArray(transaction.linkedOcrExportIds)) {
      transactionObj.linkedOcrExports = transaction.linkedOcrExportIds
        .filter((customer: any) => customer && typeof customer === 'object' && '_id' in customer)
        .map((customer: any) => ({
          id: String(customer._id),
          customerName: customer.customerName,
          customerAddress: customer.customerAddress,
          appName: customer.appName,
          entryId: customer.entryId,
        }));
    }

    // Add linked delivery orders info if present
    if (transaction.linkedDeliveryOrderIds && Array.isArray(transaction.linkedDeliveryOrderIds)) {
      transactionObj.linkedDeliveryOrders = transaction.linkedDeliveryOrderIds
        .filter((order: any) => order && typeof order === 'object' && '_id' in order)
        .map((order: any) => ({
          id: String(order._id),
          restaurantName: order.restaurantName,
          appName: order.appName,
          miles: order.miles,
          money: order.money,
          entryId: order.entryId,
          userLatitude: order.userLatitude,
          userLongitude: order.userLongitude,
          userAddress: order.userAddress,
        }));
    }

    return NextResponse.json(transactionObj);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const body = await request.json();
    const { amount, type, date, time, isBill, notes, tag, dueDate } = body;

    const existingTransaction = await Transaction.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();

    if (!existingTransaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Validate amount if provided
    let parsedAmount: number | undefined;
    if (amount !== undefined) {
      const parsed = parseFloatSafe(amount);
      if (parsed === null || parsed <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      parsedAmount = parsed;
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

    let transactionDate: Date | undefined;
    if (date && time) {
      try {
        transactionDate = parseDateAsUTC(date, time);
      } catch (error) {
        return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
      }
    } else if (date) {
      // If only date is provided, parse as UTC at midnight
      try {
        transactionDate = parseDateOnlyAsUTC(date);
      } catch (error) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }
    }

    const updateData: Partial<{
      amount: number;
      type: string;
      date: Date;
      time: string;
      isBill: boolean;
      notes?: string;
      tag?: string;
      dueDate?: Date;
    }> = {};

    if (parsedAmount !== undefined) {
      updateData.amount = parsedAmount;
    }
    if (type !== undefined) {
      if (!isValidEnum(type, TRANSACTION_TYPES)) {
        return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
      }
      updateData.type = type;
    }
    if (transactionDate) {
      updateData.date = transactionDate;
    }
    if (time) {
      updateData.time = time;
    }
    if (isBill !== undefined) {
      updateData.isBill = isBill;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (tag !== undefined) {
      updateData.tag = tag;
    }
    if (parsedDueDate !== undefined) {
      updateData.dueDate = parsedDueDate;
    }

    const transaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Convert to plain object and format dates as YYYY-MM-DD strings using UTC
    const transactionObj = transaction.toObject();
    
    // Format the transaction date
    let formattedDate: string | undefined;
    if (transactionObj.date) {
      formattedDate = formatDateAsUTC(new Date(transactionObj.date));
    }
    
    // Format dueDate
    let formattedDueDate: string | undefined;
    if (transactionObj.dueDate) {
      formattedDueDate = formatDateAsUTC(new Date(transactionObj.dueDate));
    }

    return NextResponse.json({
      ...transactionObj,
      date: formattedDate || transactionObj.date,
      dueDate: formattedDueDate,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const transaction = await Transaction.findOneAndDelete({
      _id: id,
      userId: session.user.id,
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

