import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import { handleApiError } from "@/lib/api-error-handler";
import { groupByAddress } from "@/lib/ocr-analytics";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");

    const page = Math.max(1, parseInt(pageParam || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || "50")));
    const skip = (page - 1) * limit;

    // Build query
    const query: Record<string, any> = {};
    if (userId) {
      query.userId = userId;
    }

    // Get all matching entries
    const entries = await OcrExport.find(query)
      .sort({ processedAt: -1 })
      .lean();

    // Group entries by address (address is the unique identifier)
    const addressGroups = groupByAddress(entries);

    // Build customer list with visit counts (grouped by address)
    const customers = Array.from(addressGroups.entries()).map(([address, visits]) => {
      const sortedVisits = visits.sort(
        (a, b) =>
          new Date(b.processedAt || b.createdAt).getTime() -
          new Date(a.processedAt || a.createdAt).getTime()
      );

      // Get all unique customer names for this address
      const customerNames = Array.from(
        new Set(visits.map((v) => v.customerName).filter(Boolean))
      );
      
      // Use the most common customer name as the primary name
      const nameCounts: Record<string, number> = {};
      visits.forEach((v) => {
        const name = (v.customerName || "").trim();
        if (name) {
          nameCounts[name] = (nameCounts[name] || 0) + 1;
        }
      });
      const primaryCustomerName =
        Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        customerNames[0] ||
        "Unknown";

      return {
        address,
        customerName: primaryCustomerName,
        customerNames, // All names associated with this address
        visitCount: visits.length,
        isRepeatCustomer: visits.length > 1,
        firstVisitDate: sortedVisits[sortedVisits.length - 1].processedAt || sortedVisits[sortedVisits.length - 1].createdAt,
        lastVisitDate: sortedVisits[0].processedAt || sortedVisits[0].createdAt,
        apps: Array.from(
          new Set(visits.map((v) => v.appName).filter(Boolean))
        ),
      };
    });

    // Sort by visit count (descending)
    customers.sort((a, b) => b.visitCount - a.visitCount);

    // Apply pagination
    const total = customers.length;
    const paginatedCustomers = customers.slice(skip, skip + limit);

    return NextResponse.json({
      customers: paginatedCustomers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    // Delete all entries with the exact address for the authenticated user
    const result = await OcrExport.deleteMany({
      userId: session.user.id,
      customerAddress: address,
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} entr${result.deletedCount === 1 ? "y" : "ies"} for address`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

