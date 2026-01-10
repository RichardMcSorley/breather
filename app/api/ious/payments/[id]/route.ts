import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import IOUPayment from "@/lib/models/IOUPayment";
import { handleApiError } from "@/lib/api-error-handler";
import { isValidObjectId, parseFloatSafe, sanitizeString } from "@/lib/validation";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

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
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    const body = await request.json();
    const { iouId, personName, amount, paymentDate, notes, isAgreementPayment } = body;

    const updateData: Partial<{
      iouId: string;
      personName: string;
      amount: number;
      paymentDate: Date;
      notes: string | null;
      isAgreementPayment: boolean;
    }> = {};

    if (iouId !== undefined) {
      if (!isValidObjectId(iouId)) {
        return NextResponse.json({ error: "Invalid IOU ID" }, { status: 400 });
      }
      updateData.iouId = iouId;
    }
    if (personName !== undefined) {
      const sanitizedPersonName = sanitizeString(personName);
      if (!sanitizedPersonName) {
        return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
      }
      updateData.personName = sanitizedPersonName;
    }
    if (amount !== undefined) {
      const parsedAmount = parseFloatSafe(amount, 0);
      if (parsedAmount === null) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      updateData.amount = parsedAmount;
    }
    if (paymentDate !== undefined) {
      updateData.paymentDate = parseDateOnlyAsUTC(paymentDate);
    }
    if (notes !== undefined) {
      updateData.notes = notes ? sanitizeString(notes) || null : null;
    }
    if (isAgreementPayment !== undefined) {
      updateData.isAgreementPayment = isAgreementPayment;
    }

    const payment = await IOUPayment.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    ).populate("iouId", "personName description");

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const paymentObj = payment.toObject();
    const formattedPayment = {
      ...paymentObj,
      _id: paymentObj._id.toString(),
      paymentDate: formatDateAsUTC(new Date(paymentObj.paymentDate)),
      createdAt: paymentObj.createdAt.toISOString(),
      updatedAt: paymentObj.updatedAt.toISOString(),
    };

    return NextResponse.json(formattedPayment);
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
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
    }

    const payment = await IOUPayment.findOneAndDelete({
      _id: id,
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
