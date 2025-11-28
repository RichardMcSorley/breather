import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { groupByAddress } from "@/lib/ocr-analytics";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const filterAmount = searchParams.get("filterAmount");
    const filterAppName = searchParams.get("filterAppName");
    const filterDateTime = searchParams.get("filterDateTime");

    const page = Math.max(1, parseInt(pageParam || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || "50")));
    const skip = (page - 1) * limit;

    // Parse filter values
    const filterAmountNum = filterAmount ? parseFloat(filterAmount) : null;
    let filterDate: Date | null = null;
    if (filterDateTime) {
      try {
        filterDate = new Date(filterDateTime);
        if (isNaN(filterDate.getTime())) {
          filterDate = null;
        }
      } catch {
        filterDate = null;
      }
    }

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
    let customers = Array.from(addressGroups.entries()).map(([address, visits]) => {
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

    // Apply filters if provided
    if (filterAppName || filterDate || filterAmountNum !== null) {
      // Get all entry IDs for customers that might have linked transactions
      const allEntryIds = Array.from(addressGroups.values()).flat().map((v: any) => v._id);
      
      // Fetch linked transactions for income amount matching
      let linkedTransactionsByEntryId: Map<string, any[]> = new Map();
      if (filterAmountNum !== null && userId) {
        const linkedTransactions = await Transaction.find({
          userId,
          linkedOcrExportIds: { $in: allEntryIds },
          type: "income",
        }).lean();
        
        linkedTransactions.forEach((t) => {
          const entryIds = t.linkedOcrExportIds || [];
          if (Array.isArray(entryIds)) {
            entryIds.forEach((entryId: any) => {
              const entryIdStr = entryId.toString();
              if (!linkedTransactionsByEntryId.has(entryIdStr)) {
                linkedTransactionsByEntryId.set(entryIdStr, []);
              }
              linkedTransactionsByEntryId.get(entryIdStr)!.push(t);
            });
          }
        });
      }

      customers = customers.filter((customer) => {
        // Get all visits for this customer
        const customerVisits = addressGroups.get(customer.address) || [];
        
        // Check if any visit matches the filters
        const hasMatchingVisit = customerVisits.some((visit: any) => {
          // Check appName filter
          if (filterAppName) {
            const visitAppName = (visit.appName || "").trim().toLowerCase();
            const filterAppNameLower = filterAppName.trim().toLowerCase();
            if (visitAppName !== filterAppNameLower) {
              return false;
            }
          }

          // Check time filter (within 1 hour)
          if (filterDate) {
            const visitDate = new Date(visit.processedAt || visit.createdAt);
            const timeDiff = Math.abs(filterDate.getTime() - visitDate.getTime());
            const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds
            if (timeDiff > oneHourInMs) {
              return false;
            }
          }

          // Check amount filter (check linked transactions for this visit)
          if (filterAmountNum !== null) {
            const visitEntryId = visit._id.toString();
            const linkedTransactions = linkedTransactionsByEntryId.get(visitEntryId) || [];
            
            // Check if any linked transaction has matching amount
            const hasMatchingAmount = linkedTransactions.some((t: any) => {
              return Math.abs(t.amount - filterAmountNum) < 0.01; // Allow small floating point differences
            });
            
            // If no linked transactions exist yet, we can't filter by amount
            // So we'll allow it through if other filters match
            // This allows linking new transactions
            if (linkedTransactions.length > 0 && !hasMatchingAmount) {
              return false;
            }
          }

          return true;
        });

        return hasMatchingVisit;
      });
    }

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

