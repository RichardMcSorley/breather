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
        liquidCash: 0,
        monthlyBurnRate: 0,
        fixedExpenses: 0,
        estimatedTaxRate: 0,
        irsMileageDeduction: 0.67,
      });
      return NextResponse.json(newSettings.toObject());
    } else {
      // Ensure irsMileageDeduction exists for existing users
      if (settings.irsMileageDeduction === undefined || settings.irsMileageDeduction === null) {
        settings.irsMileageDeduction = 0.67;
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
    const { liquidCash, monthlyBurnRate, fixedExpenses, estimatedTaxRate, irsMileageDeduction } = body;

    // Parse irsMileageDeduction - handle both number and string inputs
    let parsedIrsMileage: number = 0.67; // default
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

    const updateData: any = {
      liquidCash: liquidCash !== undefined && liquidCash !== "" ? parseFloat(liquidCash) : 0,
      monthlyBurnRate: monthlyBurnRate !== undefined && monthlyBurnRate !== "" ? parseFloat(monthlyBurnRate) : 0,
      fixedExpenses: fixedExpenses !== undefined && fixedExpenses !== "" ? parseFloat(fixedExpenses) : 0,
      estimatedTaxRate: estimatedTaxRate !== undefined && estimatedTaxRate !== "" ? parseFloat(estimatedTaxRate) : 0,
      irsMileageDeduction: parsedIrsMileage,
    };

    // Use findOneAndUpdate with explicit $set to ensure all fields are updated
    const settings = await UserSettings.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: {
          liquidCash: updateData.liquidCash,
          monthlyBurnRate: updateData.monthlyBurnRate,
          fixedExpenses: updateData.fixedExpenses,
          estimatedTaxRate: updateData.estimatedTaxRate,
          irsMileageDeduction: updateData.irsMileageDeduction,
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

