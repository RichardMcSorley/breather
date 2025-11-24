import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const query: any = { userId: session.user.id };
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
    const { name, amount, dueDate, category, notes, isActive } = body;

    if (!name || amount === undefined || !dueDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const bill = await Bill.create({
      userId: session.user.id,
      name,
      amount: parseFloat(amount),
      dueDate: parseInt(dueDate),
      category,
      notes,
      isActive: isActive !== undefined ? isActive : true,
      lastAmount: parseFloat(amount),
    });

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

