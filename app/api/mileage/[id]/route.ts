import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, parseDateOnlyAsEST, formatDateAsUTC } from "@/lib/date-utils";
import { isValidObjectId, parseFloatSafe, isValidEnum, MILEAGE_CLASSIFICATIONS } from "@/lib/validation";
import { MileageResponse } from "@/lib/types";

export async function GET(
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
      return NextResponse.json({ error: "Invalid mileage entry ID" }, { status: 400 });
    }

    const mileageEntry = await Mileage.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();

    if (!mileageEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    // Format date as YYYY-MM-DD string using UTC
    const entryObj = {
      _id: String(mileageEntry._id),
      userId: mileageEntry.userId,
      odometer: mileageEntry.odometer,
      date: mileageEntry.date ? formatDateAsUTC(new Date(mileageEntry.date)) : "",
      classification: mileageEntry.classification,
      carId: mileageEntry.carId,
      notes: mileageEntry.notes,
      createdAt: mileageEntry.createdAt.toISOString(),
      updatedAt: mileageEntry.updatedAt.toISOString(),
    } as MileageResponse;

    return NextResponse.json(entryObj);
  } catch (error) {
    return handleApiError(error);
  }
}

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
      return NextResponse.json({ error: "Invalid mileage entry ID" }, { status: 400 });
    }

    const body = await request.json();
    const { odometer, date, notes, classification, carId } = body;

    const existingEntry = await Mileage.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();

    if (!existingEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    let parsedOdometer: number | undefined;
    if (odometer !== undefined) {
      const parsed = parseFloatSafe(odometer, 0);
      if (parsed === null) {
        return NextResponse.json({ error: "Invalid odometer value" }, { status: 400 });
      }
      parsedOdometer = parsed;
    }

    // Parse date as EST date and convert to UTC
    // This matches the timezone logic used for transaction logs
    let parsedDate: Date | undefined;
    if (date) {
      try {
        parsedDate = parseDateOnlyAsEST(date);
      } catch (error) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }
    }

    const updateData: Partial<{
      odometer: number;
      date: Date;
      notes?: string;
      carId?: string;
      classification: "work" | "personal";
    }> = {};
    
    if (parsedOdometer !== undefined) {
      updateData.odometer = parsedOdometer;
    }
    if (parsedDate) {
      updateData.date = parsedDate;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (carId !== undefined) {
      updateData.carId = carId || undefined;
    }
    // Always include classification if provided (required field)
    if (classification !== undefined && classification !== null) {
      if (!isValidEnum(classification, MILEAGE_CLASSIFICATIONS)) {
        return NextResponse.json({ error: "Invalid classification value" }, { status: 400 });
      }
      updateData.classification = classification;
    }
    // Note: If classification is not provided, we don't update it (keeps existing value)

    const mileageEntry = await Mileage.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!mileageEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    // Convert to plain object and format date as YYYY-MM-DD string using UTC
    const entryObj = mileageEntry.toObject();
    
    let formattedDate: string | undefined;
    if (entryObj.date) {
      formattedDate = formatDateAsUTC(new Date(entryObj.date));
    }

    return NextResponse.json({
      ...entryObj,
      date: formattedDate || entryObj.date,
    });
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
      return NextResponse.json({ error: "Invalid mileage entry ID" }, { status: 400 });
    }

    const mileageEntry = await Mileage.findOneAndDelete({
      _id: id,
      userId: session.user.id,
    });

    if (!mileageEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

