import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import IOU from "@/lib/models/IOU";
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
      return NextResponse.json({ error: "Invalid IOU ID" }, { status: 400 });
    }

    const body = await request.json();
    const { personName, description, amount, date, notes, isActive } = body;

    const updateData: Partial<{
      personName: string;
      description: string;
      amount: number;
      date: Date;
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
    if (description !== undefined) {
      const sanitizedDescription = sanitizeString(description);
      if (!sanitizedDescription) {
        return NextResponse.json({ error: "Invalid description" }, { status: 400 });
      }
      updateData.description = sanitizedDescription;
    }
    if (amount !== undefined) {
      const parsedAmount = parseFloatSafe(amount, 0);
      if (parsedAmount === null) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      updateData.amount = parsedAmount;
    }
    if (date !== undefined) {
      updateData.date = parseDateOnlyAsUTC(date);
    }
    if (notes !== undefined) {
      updateData.notes = notes ? sanitizeString(notes) || null : null;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    const iou = await IOU.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!iou) {
      return NextResponse.json({ error: "IOU not found" }, { status: 404 });
    }

    const iouObj = iou.toObject();
    const formattedIOU = {
      ...iouObj,
      _id: iouObj._id.toString(),
      date: formatDateAsUTC(new Date(iouObj.date)),
      createdAt: iouObj.createdAt.toISOString(),
      updatedAt: iouObj.updatedAt.toISOString(),
    };

    return NextResponse.json(formattedIOU);
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
      return NextResponse.json({ error: "Invalid IOU ID" }, { status: 400 });
    }

    const iou = await IOU.findOneAndDelete({
      _id: id,
      userId: session.user.id,
    });

    if (!iou) {
      return NextResponse.json({ error: "IOU not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
