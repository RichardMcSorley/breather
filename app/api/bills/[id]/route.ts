import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";
import { isValidObjectId, parseFloatSafe, parseIntSafe, sanitizeString } from "@/lib/validation";

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

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, amount, dueDate, company, category, notes, isActive, useInPlan } = body;

    const updateData: Partial<{
      name: string;
      amount: number;
      lastAmount: number;
      dueDate: number;
      company: string | null;
      category: string | null;
      notes: string | null;
      isActive: boolean;
      useInPlan: boolean;
    }> = {};

    if (name !== undefined) {
      const sanitizedName = sanitizeString(name);
      if (!sanitizedName) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      updateData.name = sanitizedName;
    }
    if (amount !== undefined) {
      const parsedAmount = parseFloatSafe(amount, 0);
      if (parsedAmount === null) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      updateData.amount = parsedAmount;
      updateData.lastAmount = parsedAmount;
    }
    if (dueDate !== undefined) {
      const parsedDueDate = parseIntSafe(dueDate, 1, 31);
      if (parsedDueDate === null) {
        return NextResponse.json({ error: "Invalid due date (must be 1-31)" }, { status: 400 });
      }
      updateData.dueDate = parsedDueDate;
    }
    if (company !== undefined) {
      updateData.company = company ? sanitizeString(company) || null : null;
    }
    if (category !== undefined) {
      updateData.category = category ? sanitizeString(category) || null : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes ? sanitizeString(notes) || null : null;
    }
    if (isActive !== undefined) updateData.isActive = isActive;
    if (useInPlan !== undefined) updateData.useInPlan = useInPlan;

    const bill = await Bill.findOneAndUpdate(
      { _id: params.id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json(bill);
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

    if (!isValidObjectId(params.id)) {
      return NextResponse.json({ error: "Invalid bill ID" }, { status: 400 });
    }

    const bill = await Bill.findOneAndDelete({
      _id: params.id,
      userId: session.user.id,
    });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

