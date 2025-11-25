import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";
import { parseFloatSafe, parseIntSafe, sanitizeString } from "@/lib/validation";
import { BillQuery } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const query: BillQuery = { userId: session.user.id };
    if (isActive !== null) {
      query.isActive = isActive === "true";
    }

    const bills = await Bill.find(query).sort({ dueDate: 1, name: 1 }).lean();

    return NextResponse.json({ bills });
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
    const { name, amount, dueDate, company, category, notes, isActive, useInPlan } = body;

    if (!name || amount === undefined || !dueDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sanitizedName = sanitizeString(name);
    if (!sanitizedName) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const parsedAmount = parseFloatSafe(amount, 0);
    if (parsedAmount === null) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const parsedDueDate = parseIntSafe(dueDate, 1, 31);
    if (parsedDueDate === null) {
      return NextResponse.json({ error: "Invalid due date (must be 1-31)" }, { status: 400 });
    }

    const bill = await Bill.create({
      userId: session.user.id,
      name: sanitizedName,
      amount: parsedAmount,
      dueDate: parsedDueDate,
      company: company ? sanitizeString(company) || null : null,
      category: category ? sanitizeString(category) || null : null,
      notes: notes ? sanitizeString(notes) || null : null,
      isActive: isActive !== undefined ? isActive : true,
      useInPlan: useInPlan !== undefined ? useInPlan : true,
      lastAmount: parsedAmount,
    });

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

