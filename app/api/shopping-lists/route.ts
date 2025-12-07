import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import ShoppingList from "@/lib/models/ShoppingList";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const lists = await ShoppingList.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .select("_id name locationId items createdAt")
      .lean();

    return NextResponse.json(lists);
  } catch (error) {
    return handleApiError(error);
  }
}
