import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import DailyRateAgreement from "@/lib/models/DailyRateAgreement";
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
      return NextResponse.json({ error: "Invalid agreement ID" }, { status: 400 });
    }

    const body = await request.json();
    const { personName, dailyRate, startDate, notes, isActive } = body;

    const updateData: Partial<{
      personName: string;
      dailyRate: number;
      startDate: Date;
      notes: string | null;
      isActive: boolean;
    }> = {};

    if (personName !== undefined) {
      const sanitizedPersonName = sanitizeString(personName);
      if (!sanitizedPersonName) {
        return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
      }
      updateData.personName = sanitizedPersonName;
    }
    if (dailyRate !== undefined) {
      const parsedDailyRate = parseFloatSafe(dailyRate, 0);
      if (parsedDailyRate === null) {
        return NextResponse.json({ error: "Invalid daily rate" }, { status: 400 });
      }
      updateData.dailyRate = parsedDailyRate;
    }
    if (startDate !== undefined) {
      updateData.startDate = parseDateOnlyAsUTC(startDate);
    }
    if (notes !== undefined) {
      updateData.notes = notes ? sanitizeString(notes) || null : null;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    const agreement = await DailyRateAgreement.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!agreement) {
      return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
    }

    const agreementObj = agreement.toObject();
    const formattedAgreement = {
      ...agreementObj,
      _id: agreementObj._id.toString(),
      startDate: formatDateAsUTC(new Date(agreementObj.startDate)),
      createdAt: agreementObj.createdAt.toISOString(),
      updatedAt: agreementObj.updatedAt.toISOString(),
    };

    return NextResponse.json(formattedAgreement);
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
      return NextResponse.json({ error: "Invalid agreement ID" }, { status: 400 });
    }

    const agreement = await DailyRateAgreement.findOneAndDelete({
      _id: id,
      userId: session.user.id,
    });

    if (!agreement) {
      return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
