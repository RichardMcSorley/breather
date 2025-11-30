import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import { getTeslaAuthUrl } from "@/lib/tesla-api";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString("hex");
    
    // Store state in session or cookie (for production, use a proper session store)
    // For now, we'll include it in the redirect URL as a query param
    const authUrl = getTeslaAuthUrl(state);

    return NextResponse.json({ authUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}

