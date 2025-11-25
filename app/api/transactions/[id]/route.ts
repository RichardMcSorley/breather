import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateAsUTC, parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const transaction = await Transaction.findOne({
      _id: params.id,
      userId: session.user.id,
    }).lean();

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Format dates as YYYY-MM-DD strings using UTC
    const transactionObj: any = { ...transaction };
    
    // Format the transaction date
    if (transactionObj.date) {
      transactionObj.date = formatDateAsUTC(new Date(transactionObj.date));
    }
    
    // Format dueDate
    if (transactionObj.dueDate) {
      transactionObj.dueDate = formatDateAsUTC(new Date(transactionObj.dueDate));
    }

    return NextResponse.json(transactionObj);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { amount, type, date, time, isBill, notes, tag, dueDate } = body;

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

    const transaction = await Transaction.findOneAndUpdate(
      { _id: params.id, userId: session.user.id },
      {
        amount: parseFloat(amount),
        type,
        ...(transactionDate ? { date: transactionDate } : {}),
        ...(time ? { time } : {}),
        isBill: isBill || false,
        notes,
        tag,
        dueDate: parsedDueDate,
      },
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const transaction = await Transaction.findOneAndDelete({
      _id: params.id,
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

