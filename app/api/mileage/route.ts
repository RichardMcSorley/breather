import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";

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
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const mileageEntries = await Mileage.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Format dates as YYYY-MM-DD strings to avoid timezone issues
    const formattedEntries = mileageEntries.map((entry: any) => {
      const dateObj = new Date(entry.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return { ...entry, date: `${year}-${month}-${day}` };
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
    const { odometer, date, notes } = body;

    if (!odometer || odometer < 0 || !date) {
      return NextResponse.json({ error: "Missing required fields or invalid odometer value" }, { status: 400 });
    }

    // Parse date as local date to avoid timezone issues
    // date is in YYYY-MM-DD format
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);

    const mileageEntry = await Mileage.create({
      userId: session.user.id,
      odometer: parseFloat(odometer),
      date: localDate,
      notes,
    });

    // Format date as YYYY-MM-DD string to avoid timezone issues
    const entryObj = mileageEntry.toObject();
    const dateObj = new Date(entryObj.date);
    const formattedYear = dateObj.getFullYear();
    const formattedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(dateObj.getDate()).padStart(2, '0');
    entryObj.date = `${formattedYear}-${formattedMonth}-${formattedDay}`;

    return NextResponse.json(entryObj, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

