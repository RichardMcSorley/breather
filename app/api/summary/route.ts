import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import { handleApiError } from "@/lib/api-error-handler";
import { calculateSummary } from "@/lib/summary-calculator";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const localDateStr = searchParams.get("localDate");
    const viewMode = searchParams.get("viewMode") || "day";

    const result = await calculateSummary(session.user.id, localDateStr, viewMode);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

