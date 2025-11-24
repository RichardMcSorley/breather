import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import { handleApiError } from "@/lib/api-error-handler";

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

    const mileageEntry = await Mileage.findOneAndDelete({
      _id: params.id,
      userId: session.user.id,
    });

    if (!mileageEntry) {
      return NextResponse.json({ error: "Mileage entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

