import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, parseDateOnlyAsEST, parseESTAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { parseFloatSafe, validatePagination, isValidEnum, MILEAGE_CLASSIFICATIONS } from "@/lib/validation";
import { MileageQuery, FormattedMileageEntry, MileageListResponse } from "@/lib/types";

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
    
    // Allow higher limit for calculation queries (up to 10000)
    const requestedLimit = searchParams.get("limit");
    const maxLimit = requestedLimit && parseInt(requestedLimit) > 100 ? 10000 : 100;
    
    const pagination = validatePagination(
      searchParams.get("page"),
      searchParams.get("limit"),
      maxLimit
    );
    if (!pagination) {
      return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
    }
    const { page, limit } = pagination;

    const query: MileageQuery = { userId: session.user.id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        // Parse start date as EST and convert to UTC (matches storage logic)
        query.date.$gte = parseDateOnlyAsEST(startDate);
      }
      if (endDate) {
        // Parse end date as EST at 23:59 and convert to UTC (end of EST day)
        // This ensures we include all entries for the EST day
        const endDateUTC = parseESTAsUTC(endDate, "23:59");
        endDateUTC.setUTCSeconds(59, 999);
        query.date.$lte = endDateUTC;
      }
    }

    const mileageEntries = await Mileage.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Format dates as YYYY-MM-DD strings using UTC
    const formattedEntries: FormattedMileageEntry[] = mileageEntries.map((entry) => {
      return {
        ...entry,
        _id: entry._id.toString(),
        date: formatDateAsUTC(new Date(entry.date)),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };
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
    const { odometer, date, notes, classification, carId } = body;

    if (!odometer || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedOdometer = parseFloatSafe(odometer, 0);
    if (parsedOdometer === null) {
      return NextResponse.json({ error: "Invalid odometer value" }, { status: 400 });
    }

    const finalClassification = classification || "work";
    if (!isValidEnum(finalClassification, MILEAGE_CLASSIFICATIONS)) {
      return NextResponse.json({ error: "Invalid classification value" }, { status: 400 });
    }

    // Parse date as EST date and convert to UTC
    // This matches the timezone logic used for transaction logs
    // date is in YYYY-MM-DD format, treated as EST date
    let parsedDate: Date;
    try {
      parsedDate = parseDateOnlyAsEST(date);
    } catch (error) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const mileageEntry = await Mileage.create({
      userId: session.user.id,
      odometer: parsedOdometer,
      date: parsedDate,
      classification: finalClassification,
      carId: carId || undefined,
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

