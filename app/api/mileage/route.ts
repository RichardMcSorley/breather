import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const query: any = { userId: session.user.id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = parseDateOnlyAsUTC(startDate);
      if (endDate) {
        // For end date, include the entire day (end of day in UTC)
        const endDateUTC = parseDateOnlyAsUTC(endDate);
        endDateUTC.setUTCHours(23, 59, 59, 999);
        query.date.$lte = endDateUTC;
      }
    }

    const mileageEntries = await Mileage.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Format dates as YYYY-MM-DD strings using UTC
    const formattedEntries = mileageEntries.map((entry: any) => {
      return { ...entry, date: formatDateAsUTC(new Date(entry.date)) };
    });

    const total = await Mileage.countDocuments(query);

    return NextResponse.json({
      entries: formattedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
    const { odometer, date, notes, classification } = body;

    if (!odometer || odometer < 0 || !date) {
      return NextResponse.json({ error: "Missing required fields or invalid odometer value" }, { status: 400 });
    }

    // Parse date as UTC date
    // date is in YYYY-MM-DD format
    let parsedDate: Date;
    try {
      parsedDate = parseDateOnlyAsUTC(date);
    } catch (error) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const mileageEntry = await Mileage.create({
      userId: session.user.id,
      odometer: parseFloat(odometer),
      date: parsedDate,
      classification: classification || "work",
      notes,
    });

    // Format date as YYYY-MM-DD string using UTC
    const entryObj = mileageEntry.toObject();
    
    // Create response object with string date
    const responseObj = {
      ...entryObj,
      date: formatDateAsUTC(new Date(entryObj.date)),
    };

    return NextResponse.json(responseObj, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

