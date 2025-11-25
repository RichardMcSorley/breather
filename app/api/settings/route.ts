import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import UserSettings from "@/lib/models/UserSettings";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    let settings = await UserSettings.findOne({ userId: session.user.id }).lean();

    if (!settings) {
      const newSettings = await UserSettings.create({
        userId: session.user.id,
        irsMileageDeduction: 0.70,
      });
      return NextResponse.json(newSettings.toObject());
    } else {
      // Ensure irsMileageDeduction exists for existing users
      if (settings.irsMileageDeduction === undefined || settings.irsMileageDeduction === null) {
        settings.irsMileageDeduction = 0.70;
      }
      // Ensure arrays exist
      if (!settings.incomeSourceTags) {
        settings.incomeSourceTags = [];
      }
      if (!settings.expenseSourceTags) {
        settings.expenseSourceTags = [];
      }
      return NextResponse.json(settings);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { irsMileageDeduction, incomeSourceTags, expenseSourceTags } = body;

    // Parse irsMileageDeduction - handle both number and string inputs
    let parsedIrsMileage: number = 0.70; // default
    if (irsMileageDeduction !== undefined && irsMileageDeduction !== null && irsMileageDeduction !== '') {
      if (typeof irsMileageDeduction === 'number') {
        parsedIrsMileage = irsMileageDeduction;
      } else if (typeof irsMileageDeduction === 'string') {
        const parsed = parseFloat(irsMileageDeduction);
        if (!isNaN(parsed)) {
          parsedIrsMileage = parsed;
        }
      }
    }

    // Prepare update object
    const updateData: any = {
      irsMileageDeduction: parsedIrsMileage,
    };

    // Handle incomeSourceTags if provided
    if (incomeSourceTags !== undefined) {
      updateData.incomeSourceTags = Array.isArray(incomeSourceTags) ? incomeSourceTags : [];
    }

    // Handle expenseSourceTags if provided
    if (expenseSourceTags !== undefined) {
      updateData.expenseSourceTags = Array.isArray(expenseSourceTags) ? expenseSourceTags : [];
    }

    // Use findOneAndUpdate with explicit $set to ensure all fields are updated
    const settings = await UserSettings.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: updateData,
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true
      }
    );

    return NextResponse.json(settings.toObject());
  } catch (error) {
    return handleApiError(error);
  }
}

