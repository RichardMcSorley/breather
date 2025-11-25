import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import UserSettings from "@/lib/models/UserSettings";
import { handleApiError } from "@/lib/api-error-handler";
import { parseFloatSafe } from "@/lib/validation";

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
      // Ensure arrays exist (only set if they're undefined or null, not if they're empty arrays)
      if (settings.incomeSourceTags === undefined || settings.incomeSourceTags === null) {
        settings.incomeSourceTags = [];
      } else if (!Array.isArray(settings.incomeSourceTags)) {
        settings.incomeSourceTags = [];
      }
      if (settings.expenseSourceTags === undefined || settings.expenseSourceTags === null) {
        settings.expenseSourceTags = [];
      } else if (!Array.isArray(settings.expenseSourceTags)) {
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
      const parsed = parseFloatSafe(irsMileageDeduction, 0);
      if (parsed !== null) {
        parsedIrsMileage = parsed;
      }
    }

    // Find or create the settings document
    let settings = await UserSettings.findOne({ userId: session.user.id });

    if (!settings) {
      // Create new settings
      const newSettingsData: {
        userId: string;
        irsMileageDeduction: number;
        incomeSourceTags?: string[];
        expenseSourceTags?: string[];
      } = {
        userId: session.user.id,
        irsMileageDeduction: parsedIrsMileage,
      };
      
      if (incomeSourceTags !== undefined) {
        newSettingsData.incomeSourceTags = Array.isArray(incomeSourceTags) ? incomeSourceTags : [];
      }
      
      if (expenseSourceTags !== undefined) {
        newSettingsData.expenseSourceTags = Array.isArray(expenseSourceTags) ? expenseSourceTags : [];
      }
      
      settings = new UserSettings(newSettingsData);
    } else {
      // Update existing settings
      settings.irsMileageDeduction = parsedIrsMileage;
      
      // Always update arrays if provided
      if (incomeSourceTags !== undefined) {
        settings.incomeSourceTags = Array.isArray(incomeSourceTags) ? incomeSourceTags : [];
      }
      
      if (expenseSourceTags !== undefined) {
        settings.expenseSourceTags = Array.isArray(expenseSourceTags) ? expenseSourceTags : [];
      }
    }

    // Save the document
    await settings.save();

    // Return the saved document
    const result = settings.toObject();
    
    // Ensure arrays are always present in response
    if (!Array.isArray(result.incomeSourceTags)) {
      result.incomeSourceTags = [];
    }
    if (!Array.isArray(result.expenseSourceTags)) {
      result.expenseSourceTags = [];
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

