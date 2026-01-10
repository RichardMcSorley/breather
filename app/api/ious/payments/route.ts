import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import IOUPayment from "@/lib/models/IOUPayment";
import IOU from "@/lib/models/IOU";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { parseFloatSafe, isValidObjectId, sanitizeString } from "@/lib/validation";
import { IOUPaymentQuery } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const iouId = searchParams.get("iouId");
    const personName = searchParams.get("personName");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const query: IOUPaymentQuery = { userId: session.user.id };
    if (iouId) {
      query.iouId = iouId;
    }
    if (personName) {
      query.personName = personName;
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

    const payments = await IOUPayment.find(query)
      .populate("iouId", "personName description")
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    const formattedPayments = payments.map((payment) => ({
      ...payment,
      _id: payment._id.toString(),
      iouId: typeof payment.iouId === "object" && payment.iouId !== null
        ? payment.iouId
        : payment.iouId != null
        ? payment.iouId.toString()
        : "",
      paymentDate: payment.paymentDate ? formatDateAsUTC(new Date(payment.paymentDate)) : "",
      createdAt: payment.createdAt ? payment.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: payment.updatedAt ? payment.updatedAt.toISOString() : new Date().toISOString(),
    }));

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
    const { iouId, personName, amount, paymentDate, notes, isAgreementPayment } = body;

    if (!iouId || !personName || amount === undefined || !paymentDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidObjectId(iouId)) {
      return NextResponse.json({ error: "Invalid IOU ID" }, { status: 400 });
    }

    const parsedAmount = parseFloatSafe(amount, 0);
    if (parsedAmount === null) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const sanitizedPersonName = sanitizeString(personName);
    if (!sanitizedPersonName) {
      return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
    }

    // Verify IOU belongs to user
    const iou = await IOU.findOne({
      _id: iouId,
      userId: session.user.id,
    });

    if (!iou) {
      return NextResponse.json({ error: "IOU not found" }, { status: 404 });
    }

    const paymentDateObj = parseDateOnlyAsUTC(paymentDate);

    const payment = await IOUPayment.create({
      userId: session.user.id,
      iouId,
      personName: sanitizedPersonName,
      amount: parsedAmount,
      paymentDate: paymentDateObj,
      notes: notes ? sanitizeString(notes) || null : null,
      isAgreementPayment: isAgreementPayment || false,
    });

    await payment.populate("iouId", "personName description");

    const paymentObj = payment.toObject();
    const formattedPayment = {
      ...paymentObj,
      _id: paymentObj._id.toString(),
      paymentDate: formatDateAsUTC(new Date(paymentObj.paymentDate)),
      createdAt: paymentObj.createdAt.toISOString(),
      updatedAt: paymentObj.updatedAt.toISOString(),
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

    const result = await IOUPayment.deleteMany({
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
