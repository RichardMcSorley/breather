import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { formatDateAsUTC } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get all transactions for the user (excluding bills and balance adjustments)
    const transactions = await Transaction.find({
      userId: session.user.id,
      isBill: { $ne: true },
      isBalanceAdjustment: { $ne: true },
    })
      .select("date time type amount")
      .lean();

    // Return all transactions with date and time so frontend can format them
    // Frontend will group by date using the same formatDate function
    return NextResponse.json({ 
      transactions: transactions.map(t => ({
        date: formatDateAsUTC(new Date(t.date)),
        time: t.time,
        type: t.type,
        amount: t.amount,
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

