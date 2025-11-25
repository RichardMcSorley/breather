import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

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
    const { amount, paymentDate, notes } = body;

    // Find the payment and verify it belongs to the user
    const payment = await BillPayment.findOne({
      _id: params.id,
      userId: session.user.id,
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Update payment fields
    if (amount !== undefined) {
      payment.amount = parseFloat(amount);
    }
    if (paymentDate) {
      payment.paymentDate = parseDateOnlyAsUTC(paymentDate);
    }
    if (notes !== undefined) {
      payment.notes = notes || undefined;
    }

    await payment.save();

    // Populate bill info
    await payment.populate("billId", "name company");

    const paymentObj = payment.toObject();
    const formattedPayment: any = {
      ...paymentObj,
      paymentDate: formatDateAsUTC(new Date(paymentObj.paymentDate)),
    };

    return NextResponse.json(formattedPayment);
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

    const payment = await BillPayment.findOneAndDelete({
      _id: params.id,
      userId: session.user.id,
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

