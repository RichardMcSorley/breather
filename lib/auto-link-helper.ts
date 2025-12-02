import Transaction from "@/lib/models/Transaction";
import OcrExport from "@/lib/models/OcrExport";
import DeliveryOrder from "@/lib/models/DeliveryOrder";

/**
 * Attempts to auto-link an income transaction to a matching customer (OcrExport).
 * Only links if there is exactly one match and the transaction is not already linked.
 * 
 * @param transaction - The transaction to link
 * @param userId - The user ID for filtering
 * @returns The linked customer ID if successful, null otherwise
 */
export async function attemptAutoLinkTransactionToCustomer(
  transaction: any,
  userId: string
): Promise<string | null> {
  // Only link income transactions
  if (transaction.type !== "income") {
    return null;
  }

  // Skip if transaction is already linked to any customer
  if (transaction.linkedOcrExportIds && transaction.linkedOcrExportIds.length > 0) {
    return null;
  }

  // Need transaction tag (appName) to match
  if (!transaction.tag) {
    return null;
  }

  const transactionTag = (transaction.tag || "").trim().toLowerCase();
  if (!transactionTag) {
    return null;
  }

  // Find customers with matching appName
  const matchingCustomers = await OcrExport.find({
    userId,
    appName: { $regex: new RegExp(`^${transactionTag}$`, "i") },
  }).lean();

  // Only auto-link if there is exactly one match
  if (matchingCustomers.length !== 1) {
    return null;
  }

  const customer = matchingCustomers[0];

  // Perform the bidirectional link
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { $addToSet: { linkedOcrExportIds: customer._id } },
    { new: true }
  );

  await OcrExport.findByIdAndUpdate(
    customer._id,
    { $addToSet: { linkedTransactionIds: transaction._id } },
    { new: true }
  );

  return customer._id.toString();
}

/**
 * Attempts to auto-link an income transaction to a matching delivery order.
 * Only links if there is exactly one match and the transaction is not already linked.
 * 
 * @param transaction - The transaction to link
 * @param userId - The user ID for filtering
 * @returns The linked order ID if successful, null otherwise
 */
export async function attemptAutoLinkTransactionToOrder(
  transaction: any,
  userId: string
): Promise<string | null> {
  // Only link income transactions
  if (transaction.type !== "income") {
    return null;
  }

  // Skip if transaction is already linked to any order
  if (transaction.linkedDeliveryOrderIds && transaction.linkedDeliveryOrderIds.length > 0) {
    return null;
  }

  // Need transaction tag (appName) to match
  if (!transaction.tag) {
    return null;
  }

  const transactionTag = (transaction.tag || "").trim().toLowerCase();
  if (!transactionTag) {
    return null;
  }

  // Find orders with matching appName and amount (within $0.01)
  const matchingOrders = await DeliveryOrder.find({
    userId,
    appName: { $regex: new RegExp(`^${transactionTag}$`, "i") },
  }).lean();

  // Filter by amount match (within $0.01)
  const amountMatchedOrders = matchingOrders.filter((order) => {
    const amountDiff = Math.abs(transaction.amount - order.money);
    return amountDiff < 0.01;
  });

  // Only auto-link if there is exactly one match
  if (amountMatchedOrders.length !== 1) {
    return null;
  }

  const order = amountMatchedOrders[0];

  // Perform the bidirectional link
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { $addToSet: { linkedDeliveryOrderIds: order._id } },
    { new: true }
  );

  await DeliveryOrder.findByIdAndUpdate(
    order._id,
    { $addToSet: { linkedTransactionIds: transaction._id } },
    { new: true }
  );

  return order._id.toString();
}

/**
 * Attempts to auto-link a delivery order to a matching income transaction.
 * Only links if there is exactly one match and the order is not already linked.
 * 
 * @param order - The delivery order to link
 * @param userId - The user ID for filtering
 * @returns The linked transaction ID if successful, null otherwise
 */
export async function attemptAutoLinkOrderToTransaction(
  order: any,
  userId: string
): Promise<string | null> {
  // Skip if order is already linked to any transaction
  if (order.linkedTransactionIds && order.linkedTransactionIds.length > 0) {
    return null;
  }

  // Need order appName to match
  if (!order.appName) {
    return null;
  }

  const orderAppName = (order.appName || "").trim().toLowerCase();
  if (!orderAppName) {
    return null;
  }

  // Find income transactions with matching tag (appName) and amount (within $0.01)
  const matchingTransactions = await Transaction.find({
    userId,
    type: "income",
    tag: { $regex: new RegExp(`^${orderAppName}$`, "i") },
  }).lean();

  // Filter by amount match (within $0.01) and ensure transaction is not already linked
  const amountMatchedTransactions = matchingTransactions.filter((transaction) => {
    const amountDiff = Math.abs(transaction.amount - order.money);
    const isAmountMatch = amountDiff < 0.01;
    const isNotLinked = !transaction.linkedDeliveryOrderIds || transaction.linkedDeliveryOrderIds.length === 0;
    return isAmountMatch && isNotLinked;
  });

  // Only auto-link if there is exactly one match
  if (amountMatchedTransactions.length !== 1) {
    return null;
  }

  const transaction = amountMatchedTransactions[0];

  // Perform the bidirectional link
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { $addToSet: { linkedDeliveryOrderIds: order._id } },
    { new: true }
  );

  await DeliveryOrder.findByIdAndUpdate(
    order._id,
    { $addToSet: { linkedTransactionIds: transaction._id } },
    { new: true }
  );

  return transaction._id.toString();
}

/**
 * Attempts to auto-link a customer (OcrExport) to a matching income transaction.
 * Links to the latest unlinked transaction if app name matches.
 * Optionally matches by amount if provided.
 * 
 * @param customer - The customer (OcrExport) to link
 * @param userId - The user ID for filtering
 * @param amount - Optional amount to match (within $0.01 tolerance)
 * @returns The linked transaction ID if successful, null otherwise
 */
export async function attemptAutoLinkCustomerToTransaction(
  customer: any,
  userId: string,
  amount?: number
): Promise<string | null> {
  // Skip if customer is already linked to any transaction
  if (customer.linkedTransactionIds && customer.linkedTransactionIds.length > 0) {
    return null;
  }

  // Need customer appName to match
  if (!customer.appName) {
    return null;
  }

  const customerAppName = (customer.appName || "").trim().toLowerCase();
  if (!customerAppName) {
    return null;
  }

  // Find income transactions with matching tag (appName), sorted by date (latest first)
  const matchingTransactions = await Transaction.find({
    userId,
    type: "income",
    tag: { $regex: new RegExp(`^${customerAppName}$`, "i") },
  })
    .sort({ date: -1, createdAt: -1 }) // Latest first
    .lean();

  // Filter to only transactions that are not already linked
  let unlinkedTransactions = matchingTransactions.filter((transaction) => {
    return !transaction.linkedOcrExportIds || transaction.linkedOcrExportIds.length === 0;
  });

  // If amount is provided, filter by amount match (within $0.01 tolerance)
  if (amount !== undefined && amount !== null) {
    unlinkedTransactions = unlinkedTransactions.filter((transaction) => {
      const amountDiff = Math.abs(transaction.amount - amount);
      return amountDiff < 0.01;
    });
  }

  // Only auto-link if there is exactly one match
  if (unlinkedTransactions.length !== 1) {
    return null;
  }

  // Get the latest transaction (first in sorted array)
  const transaction = unlinkedTransactions[0];

  // Perform the bidirectional link
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { $addToSet: { linkedOcrExportIds: customer._id } },
    { new: true }
  );

  await OcrExport.findByIdAndUpdate(
    customer._id,
    { $addToSet: { linkedTransactionIds: transaction._id } },
    { new: true }
  );

  return transaction._id.toString();
}
