import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { searchProducts } from "@/lib/kroger-api";
import { handleApiError } from "@/lib/api-error-handler";
import { KrogerSearchParams } from "@/lib/types/kroger";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const term = searchParams.get("term");
    const brand = searchParams.get("brand");
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    const fulfillment = searchParams.get("fulfillment");
    const start = searchParams.get("start");
    const limit = searchParams.get("limit");

    // Validate that at least one search parameter is provided
    if (!term && !brand && !productId) {
      return NextResponse.json(
        { error: "At least one of term, brand, or productId must be provided" },
        { status: 400 }
      );
    }

    // Validate term length (minimum 3 characters)
    if (term && term.length < 3) {
      return NextResponse.json(
        { error: "Search term must be at least 3 characters" },
        { status: 400 }
      );
    }

    const searchParams_obj: KrogerSearchParams = {};
    if (term) searchParams_obj.term = term;
    if (brand) searchParams_obj.brand = brand;
    if (productId) searchParams_obj.productId = productId;
    if (locationId) searchParams_obj.locationId = locationId;
    if (fulfillment) searchParams_obj.fulfillment = fulfillment;
    if (start) {
      const startNum = parseInt(start, 10);
      if (isNaN(startNum) || startNum < 1 || startNum > 1000) {
        return NextResponse.json(
          { error: "Start must be between 1 and 1000" },
          { status: 400 }
        );
      }
      searchParams_obj.start = startNum;
    }
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
        return NextResponse.json(
          { error: "Limit must be between 1 and 50" },
          { status: 400 }
        );
      }
      searchParams_obj.limit = limitNum;
    } else {
      searchParams_obj.limit = 20; // Default limit
    }

    const result = await searchProducts(searchParams_obj);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

