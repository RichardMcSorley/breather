import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const mileageEntry = await Mileage.findOne({
      _id: params.id,
      userId: session.user.id,
    }).lean();

    if (!mileageEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    // Format date as YYYY-MM-DD string using UTC
    const entryObj: any = { ...mileageEntry };
    
    if (entryObj.date) {
      entryObj.date = formatDateAsUTC(new Date(entryObj.date));
    }

    return NextResponse.json(entryObj);
  } catch (error) {
    return handleApiError(error);
  }
}

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
    const { odometer, date, notes } = body;

    const existingEntry = await Mileage.findOne({
      _id: params.id,
      userId: session.user.id,
    }).lean();

    if (!existingEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    if (odometer !== undefined && (isNaN(odometer) || odometer < 0)) {
      return NextResponse.json({ error: "Invalid odometer value" }, { status: 400 });
    }

    // Parse date as UTC date
    let parsedDate: Date | undefined;
    if (date) {
      try {
        parsedDate = parseDateOnlyAsUTC(date);
      } catch (error) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }
    }

    const mileageEntry = await Mileage.findOneAndUpdate(
      { _id: params.id, userId: session.user.id },
      {
        ...(odometer !== undefined ? { odometer: parseFloat(odometer) } : {}),
        ...(parsedDate ? { date: parsedDate } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const mileageEntry = await Mileage.findOneAndDelete({
      _id: params.id,
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

