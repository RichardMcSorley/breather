import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";

const buildLocalDate = (date: string, time?: string) => {
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

    // Format dueDate as YYYY-MM-DD string to avoid timezone issues
    const transactionObj: any = { ...transaction };
    if (transactionObj.dueDate) {
      const dueDateObj = new Date(transactionObj.dueDate);
      const year = dueDateObj.getFullYear();
      const month = String(dueDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dueDateObj.getDate()).padStart(2, '0');
      transactionObj.dueDate = `${year}-${month}-${day}`;
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

    // Parse dueDate as local date to avoid timezone shifts
    let parsedDueDate: Date | undefined;
    if (dueDate) {
      // If it's in YYYY-MM-DD format, parse it as local date
      const [year, month, day] = dueDate.split('-').map(Number);
      parsedDueDate = new Date(year, month - 1, day);
    }

    let transactionDate: Date | undefined;
    if (date && time) {
      try {
        transactionDate = buildLocalDate(date, time);
      } catch (error) {
        return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
      }
    }

    const transaction = await Transaction.findOneAndUpdate(
      { _id: params.id, userId: session.user.id },
      {
        amount: parseFloat(amount),
        type,
        ...(transactionDate ? { date: transactionDate } : date ? { date: new Date(date) } : {}),
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

