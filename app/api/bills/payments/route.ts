import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
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
    const billId = searchParams.get("billId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const query: any = { userId: session.user.id };
    if (billId) {
      query.billId = billId;
    }

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) {
        query.paymentDate.$gte = parseDateOnlyAsUTC(startDate);
      }
      if (endDate) {
        const endDateUTC = parseDateOnlyAsUTC(endDate);
        endDateUTC.setUTCHours(23, 59, 59, 999);
        query.paymentDate.$lte = endDateUTC;
      }
    }

    const payments = await BillPayment.find(query)
      .populate("billId", "name company")
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    // Format dates
    const formattedPayments = payments.map((payment: any) => {
      const formatted: any = { ...payment };
      if (payment.paymentDate) {
        formatted.paymentDate = formatDateAsUTC(new Date(payment.paymentDate));
      }
      return formatted;
    });

    return NextResponse.json({ payments: formattedPayments });
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
    const { billId, amount, paymentDate, notes } = body;

    if (!billId || amount === undefined || !paymentDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify bill belongs to user
    const bill = await Bill.findOne({
      _id: billId,
      userId: session.user.id,
    });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const paymentDateObj = parseDateOnlyAsUTC(paymentDate);

    const payment = await BillPayment.create({
      userId: session.user.id,
      billId,
      amount: parseFloat(amount),
      paymentDate: paymentDateObj,
      notes,
    });

    // Populate bill info
    await payment.populate("billId", "name company");

    const paymentObj = payment.toObject();
    const formattedPayment: any = {
      ...paymentObj,
      paymentDate: formatDateAsUTC(new Date(paymentObj.paymentDate)),
    };

    return NextResponse.json(formattedPayment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Delete all payments for this user
    const result = await BillPayment.deleteMany({
      userId: session.user.id,
    });

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    return handleApiError(error);
  }
}

