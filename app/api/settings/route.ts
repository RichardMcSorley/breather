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
    const { irsMileageDeduction } = body;

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

    // Use findOneAndUpdate with explicit $set to ensure all fields are updated
    const settings = await UserSettings.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: {
          irsMileageDeduction: parsedIrsMileage,
        }
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

