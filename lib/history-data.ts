import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { validatePagination, isValidEnum, TRANSACTION_TYPES } from "@/lib/validation";
import { TransactionQuery, FormattedTransaction } from "@/lib/types";
import mongoose from "mongoose";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import OcrExport from "@/lib/models/OcrExport";
import { parseFloatSafe } from "@/lib/validation";

/**
 * Server-side data fetching functions for history/logs page
 */

export async function getTransactions(
  filterType: string = "all",
  filterTag: string = "all",
  page: number = 1,
  limit: number = 50,
  search: string = ""
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  // Ensure models are registered
  if (!mongoose.models.DeliveryOrder) {
    DeliveryOrder;
  }
  if (!mongoose.models.OcrExport) {
    OcrExport;
  }

  const pagination = validatePagination(page.toString(), limit.toString());
  if (!pagination) {
    throw new Error("Invalid pagination parameters");
  }
  const { page: validPage, limit: validLimit } = pagination;

  const query: TransactionQuery = { userId: session.user.id };

  if (filterType !== "all") {
    if (!isValidEnum(filterType, TRANSACTION_TYPES)) {
      throw new Error("Invalid transaction type");
    }
    query.type = filterType;
  }

  if (filterTag !== "all") {
    query.tag = filterTag;
  }

  // Handle search query
  if (search && search.trim()) {
    const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length > 0) {
      const termConditions: any[] = [];

      for (const searchTerm of searchTerms) {
        const termSearchConditions: any[] = [];
        const searchLower = searchTerm.toLowerCase();

        termSearchConditions.push({ tag: { $regex: searchLower, $options: "i" } });

        const searchAmount = parseFloatSafe(searchTerm);
        if (searchAmount !== null) {
          termSearchConditions.push({ amount: searchAmount });
        }

        // Parallelize DeliveryOrder and OcrExport searches
        const [matchingOrders, ordersWithAdditionalRestaurants, matchingCustomers] = await Promise.all([
          DeliveryOrder.find({
            userId: session.user.id,
            $or: [
              { restaurantName: { $regex: searchTerm, $options: "i" } },
              { appName: { $regex: searchTerm, $options: "i" } },
            ],
          }).select("_id").lean(),
          DeliveryOrder.find({
            userId: session.user.id,
            "additionalRestaurants.name": { $regex: searchTerm, $options: "i" },
          }).select("_id").lean(),
          OcrExport.find({
            userId: session.user.id,
            $or: [
              { customerName: { $regex: searchTerm, $options: "i" } },
              { appName: { $regex: searchTerm, $options: "i" } },
            ],
          }).select("_id").lean(),
        ]);

        const matchingOrderIds: mongoose.Types.ObjectId[] = [];
        matchingOrderIds.push(...matchingOrders.map((o: any) => o._id));
        ordersWithAdditionalRestaurants.forEach((o: any) => {
          if (!matchingOrderIds.some(id => id.toString() === o._id.toString())) {
            matchingOrderIds.push(o._id);
          }
        });

        const matchingCustomerIds: mongoose.Types.ObjectId[] = [];
        matchingCustomerIds.push(...matchingCustomers.map((c: any) => c._id));

        if (matchingOrderIds.length > 0) {
          termSearchConditions.push({ linkedDeliveryOrderIds: { $in: matchingOrderIds } });
        }
        if (matchingCustomerIds.length > 0) {
          termSearchConditions.push({ linkedOcrExportIds: { $in: matchingCustomerIds } });
        }

        if (termSearchConditions.length > 0) {
          termConditions.push({ $or: termSearchConditions });
        }
      }

      if (termConditions.length > 0) {
        query.$and = query.$and || [];
        query.$and.push(...termConditions);
      }
    }
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("linkedOcrExportIds", "customerName customerAddress appName entryId lat lon")
      .populate("linkedDeliveryOrderIds", "restaurantName restaurantAddress restaurantLat restaurantLon appName miles money entryId userLatitude userLongitude userAddress step active additionalRestaurants")
      .sort({ date: -1, createdAt: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const formattedTransactions: FormattedTransaction[] = transactions.map((t: any) => {
    const formatted: any = {
      ...t,
      _id: t._id.toString(),
      date: t.date ? formatDateAsUTC(new Date(t.date)) : "",
      dueDate: t.dueDate ? formatDateAsUTC(new Date(t.dueDate)) : undefined,
      step: t.step,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };

    if (t.linkedOcrExportIds && Array.isArray(t.linkedOcrExportIds)) {
      formatted.linkedOcrExports = t.linkedOcrExportIds
        .filter((customer: any) => customer && typeof customer === 'object' && '_id' in customer)
        .map((customer: any) => ({
          id: String(customer._id),
          customerName: customer.customerName,
          customerAddress: customer.customerAddress,
          appName: customer.appName,
          entryId: customer.entryId,
          lat: customer.lat,
          lon: customer.lon,
        }));
    }

    if (t.linkedDeliveryOrderIds && Array.isArray(t.linkedDeliveryOrderIds)) {
      formatted.linkedDeliveryOrders = t.linkedDeliveryOrderIds
        .filter((order: any) => order && typeof order === 'object' && '_id' in order)
        .map((order: any) => ({
          id: String(order._id),
          restaurantName: order.restaurantName,
          restaurantAddress: order.restaurantAddress,
          restaurantLat: order.restaurantLat,
          restaurantLon: order.restaurantLon,
          appName: order.appName,
          miles: order.miles,
          money: order.money,
          entryId: order.entryId,
          userLatitude: order.userLatitude,
          userLongitude: order.userLongitude,
          userAddress: order.userAddress,
          step: order.step,
          active: order.active,
          additionalRestaurants: order.additionalRestaurants || [],
        }));
    }

    return formatted;
  });

  return {
    transactions: formattedTransactions.filter(
      (t: any) => !t.isBill && !t.isBalanceAdjustment
    ),
    pagination: {
      page: validPage,
      limit: validLimit,
      total,
      totalPages: Math.ceil(total / validLimit),
    },
  };
}

export async function getDateTotals() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const transactions = await Transaction.find({
    userId: session.user.id,
    isBill: { $ne: true },
    isBalanceAdjustment: { $ne: true },
  })
    .select("date time type amount")
    .lean();

  return {
    transactions: transactions.map(t => ({
      date: formatDateAsUTC(new Date(t.date)),
      time: t.time,
      type: t.type,
      amount: t.amount,
    })),
  };
}
