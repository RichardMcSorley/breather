import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { getProductDetails } from "@/lib/kroger-api";
import { handleApiError } from "@/lib/api-error-handler";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: productId } = await params;
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");

    // Validate productId format (should be 13 digits)
    if (!productId || !/^\d{13}$/.test(productId)) {
      return NextResponse.json(
        { error: "Invalid productId. Must be a 13-digit number" },
        { status: 400 }
      );
    }

    const result = await getProductDetails(productId, locationId || undefined);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
