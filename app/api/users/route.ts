import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import User from "@/lib/models/User";
import connectDB from "@/lib/mongodb";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get all users except the current user
    const users = await User.find({
      userId: { $ne: session.user.id },
    })
      .select("userId email name image")
      .sort({ name: 1, email: 1 })
      .lean();

    // Map to the expected format
    const formattedUsers = users.map((user) => ({
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

