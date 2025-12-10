import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import User from "@/lib/models/User";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Get users by their IDs (including the current user if in the list)
    const users = await User.find({
      userId: { $in: userIds },
    })
      .select("userId email name image")
      .lean();

    // Map to the expected format - ensure userId is always present
    const formattedUsers = users
      .filter((user) => user.userId) // Only include users with userId
      .map((user) => ({
        userId: user.userId,
        email: user.email,
        name: user.name,
        image: user.image,
      }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    return handleApiError(error);
  }
}

