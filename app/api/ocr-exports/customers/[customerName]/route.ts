import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import OcrExport from "@/lib/models/OcrExport";
import Transaction from "@/lib/models/Transaction";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { handleApiError } from "@/lib/api-error-handler";
import { isSameAddress } from "@/lib/ocr-analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerName: string }> }
) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    // Await params as it's a Promise in Next.js 15+
    // Note: param name is still "customerName" for backward compatibility, but we use it as address
    const { customerName } = await params;
    
    // Decode and normalize the address (using customerName param for address)
    let decodedAddress: string;
    try {
      decodedAddress = decodeURIComponent(customerName);
    } catch {
      decodedAddress = customerName;
    }
    
    // Trim and clean the address
    decodedAddress = decodedAddress.trim();
    
    if (!decodedAddress) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    // Build query
    const query: Record<string, any> = {};
    if (userId) {
      query.userId = userId;
    }

    // Get all entries for this user
    const allEntries = await OcrExport.find(query).lean();

    if (allEntries.length === 0) {
      return NextResponse.json({
        address: decodedAddress,
        customerNames: [],
        visitCount: 0,
        firstVisitDate: null,
        lastVisitDate: null,
        apps: [],
        visits: [],
      });
    }

    // Filter entries that match the address using the same fuzzy matching logic as groupByAddress
    // This ensures consistency with the customer frequency list
    let matchingEntries = allEntries.filter((entry) => {
      if (!entry.customerAddress || entry.customerAddress.trim() === "") {
        return false;
      }
      // Use isSameAddress for fuzzy matching (same as groupByAddress uses)
      return isSameAddress(entry.customerAddress, decodedAddress);
    });

    // Sort by date (most recent first)
    matchingEntries.sort(
      (a, b) =>
        new Date(b.processedAt || b.createdAt).getTime() -
        new Date(a.processedAt || a.createdAt).getTime()
    );

    // Get all unique customer names for this address
    const customerNames = Array.from(
      new Set(matchingEntries.map((e) => e.customerName).filter(Boolean))
    );

    // Use the most common customer name as the primary name
    const nameCounts: Record<string, number> = {};
    matchingEntries.forEach((entry) => {
      const name = (entry.customerName || "").trim();
      if (name) {
        nameCounts[name] = (nameCounts[name] || 0) + 1;
      }
    });
    const primaryCustomerName =
      Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      customerNames[0] ||
      "Unknown";

    // Group by app
    const apps = Array.from(
      new Set(matchingEntries.map((e) => e.appName).filter(Boolean))
    );

    // Use the canonical address (most common variation)
    const addressCounts: Record<string, number> = {};
    matchingEntries.forEach((entry) => {
      const addr = (entry.customerAddress || "").trim();
      if (addr) {
        addressCounts[addr] = (addressCounts[addr] || 0) + 1;
      }
    });
    const canonicalAddress =
      Object.entries(addressCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      decodedAddress;

    // Get all linked transactions for these entries
    const entryIds = matchingEntries.map((e) => e._id);
    const linkedTransactions = await Transaction.find({
      userId: userId || undefined,
      linkedOcrExportIds: { $in: entryIds },
      type: "income",
    })
      .sort({ date: -1 })
      .lean();

    // Get all linked delivery orders for these entries
    // 1. Directly linked orders (linkedOcrExportIds contains customer entry)
    const directlyLinkedOrders = await DeliveryOrder.find({
      userId: userId || undefined,
      linkedOcrExportIds: { $in: entryIds },
    })
      .sort({ processedAt: -1 })
      .lean();

    // 2. Indirectly linked orders (linked through transactions)
    const transactionIds = linkedTransactions.map((t) => t._id);
    const indirectlyLinkedOrders = transactionIds.length > 0
      ? await DeliveryOrder.find({
          userId: userId || undefined,
          linkedTransactionIds: { $in: transactionIds },
        })
          .sort({ processedAt: -1 })
          .lean()
      : [];

    // Combine and deduplicate by _id, then sort by processedAt
    const allOrders = [...directlyLinkedOrders, ...indirectlyLinkedOrders];
    const uniqueOrderIds = new Set<string>();
    const linkedOrders = allOrders
      .filter((order) => {
        const orderId = order._id.toString();
        if (uniqueOrderIds.has(orderId)) {
          return false;
        }
        uniqueOrderIds.add(orderId);
        return true;
      })
      .sort((a, b) => 
        new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      );

    return NextResponse.json({
      address: canonicalAddress,
      customerName: primaryCustomerName,
      customerNames,
      visitCount: matchingEntries.length,
      firstVisitDate:
        matchingEntries.length > 0
          ? matchingEntries[matchingEntries.length - 1].processedAt ||
            matchingEntries[matchingEntries.length - 1].createdAt
          : null,
      lastVisitDate:
        matchingEntries.length > 0
          ? matchingEntries[0].processedAt || matchingEntries[0].createdAt
          : null,
      apps,
      visits: matchingEntries.map((entry) => ({
        _id: entry._id.toString(),
        entryId: entry.entryId,
        customerName: entry.customerName,
        customerAddress: entry.customerAddress,
        appName: entry.appName,
        screenshot: entry.screenshot,
        metadata: entry.metadata,
        processedAt: entry.processedAt,
        createdAt: entry.createdAt,
        lat: entry.lat,
        lon: entry.lon,
        geocodeDisplayName: entry.geocodeDisplayName,
        userLatitude: entry.userLatitude,
        userLongitude: entry.userLongitude,
        userAltitude: entry.userAltitude,
        userAddress: entry.userAddress,
      })),
      linkedTransactions: linkedTransactions.map((t) => ({
        _id: t._id.toString(),
        amount: t.amount,
        date: t.date,
        time: t.time,
        tag: t.tag,
        notes: t.notes,
      })),
      linkedOrders: linkedOrders.map((o) => ({
        id: o._id.toString(),
        restaurantName: o.restaurantName,
        appName: o.appName,
        miles: o.miles,
        money: o.money,
        milesToMoneyRatio: o.milesToMoneyRatio,
        time: o.time,
        processedAt: o.processedAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

