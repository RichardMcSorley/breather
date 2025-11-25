import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { isValidObjectId, parseFloatSafe } from "@/lib/validation";
import { BillPaymentResponse } from "@/lib/types";

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

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

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
      const parsedAmount = parseFloatSafe(amount, 0);
      if (parsedAmount === null) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      payment.amount = parsedAmount;
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
    const formattedPayment = {
      _id: String(paymentObj._id),
      userId: paymentObj.userId,
      billId: typeof paymentObj.billId === "object" && paymentObj.billId !== null
        ? paymentObj.billId
        : String(paymentObj.billId),
      amount: paymentObj.amount,
      paymentDate: formatDateAsUTC(new Date(paymentObj.paymentDate)),
      notes: paymentObj.notes,
      createdAt: paymentObj.createdAt.toISOString(),
      updatedAt: paymentObj.updatedAt.toISOString(),
    } satisfies BillPaymentResponse;

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

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

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

