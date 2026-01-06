import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import IOU from "@/lib/models/IOU";
import { handleApiError } from "@/lib/api-error-handler";
import { parseFloatSafe, sanitizeString } from "@/lib/validation";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { IOUQuery } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const personName = searchParams.get("personName");

    const query: IOUQuery = { userId: session.user.id };
    if (isActive !== null) {
      query.isActive = isActive === "true";
    }
    if (personName) {
      query.personName = personName;
    }

    const ious = await IOU.find(query).sort({ personName: 1, date: -1 }).lean();

    const formattedIOUs = ious.map((iou) => ({
      ...iou,
      _id: iou._id.toString(),
      date: iou.date ? formatDateAsUTC(new Date(iou.date)) : "",
      createdAt: iou.createdAt ? iou.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: iou.updatedAt ? iou.updatedAt.toISOString() : new Date().toISOString(),
    }));

    return NextResponse.json({ ious: formattedIOUs });
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
    const { personName, description, amount, date, notes, isActive } = body;

    if (!personName || !description || amount === undefined || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sanitizedPersonName = sanitizeString(personName);
    if (!sanitizedPersonName) {
      return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
    }

    const sanitizedDescription = sanitizeString(description);
    if (!sanitizedDescription) {
      return NextResponse.json({ error: "Invalid description" }, { status: 400 });
    }

    const parsedAmount = parseFloatSafe(amount, 0);
    if (parsedAmount === null) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const dateObj = parseDateOnlyAsUTC(date);

    const iou = await IOU.create({
      userId: session.user.id,
      personName: sanitizedPersonName,
      description: sanitizedDescription,
      amount: parsedAmount,
      date: dateObj,
      notes: notes ? sanitizeString(notes) || null : null,
      isActive: isActive !== undefined ? isActive : true,
    });

    const iouObj = iou.toObject();
    const formattedIOU = {
      ...iouObj,
      _id: iouObj._id.toString(),
      date: formatDateAsUTC(new Date(iouObj.date)),
      createdAt: iouObj.createdAt.toISOString(),
      updatedAt: iouObj.updatedAt.toISOString(),
    };

    return NextResponse.json(formattedIOU, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
