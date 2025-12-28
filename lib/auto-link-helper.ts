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
    if (order.money === undefined) return false;
    const amountDiff = Math.abs(transaction.amount - order.money);
    return amountDiff < 0.01;
  });

  // Only auto-link if there is exactly one match
  if (amountMatchedOrders.length !== 1) {
    return null;
  }

  const order = amountMatchedOrders[0];

  // Perform the bidirectional link and set active to true
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { 
      $addToSet: { linkedDeliveryOrderIds: order._id },
      $set: { active: true }
    },
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

  // Get order's processedAt date and hour for matching
  // processedAt is stored in UTC, but we need to compare with transaction time which is in EST
  const orderProcessedAt = order.processedAt instanceof Date ? order.processedAt : new Date(order.processedAt);
  
  // Convert UTC to EST for date comparison (EST is UTC-5)
  const EST_OFFSET_HOURS = 5;
  const estTimestamp = orderProcessedAt.getTime() - (EST_OFFSET_HOURS * 60 * 60 * 1000);
  const estDate = new Date(estTimestamp);
  
  // Get EST date components
  const orderDate = new Date(Date.UTC(
    estDate.getUTCFullYear(),
    estDate.getUTCMonth(),
    estDate.getUTCDate()
  ));
  const orderHourEST = estDate.getUTCHours();

  // Filter by amount match (within $0.01), date match, hour match, and ensure transaction is not already linked
  const amountMatchedTransactions = matchingTransactions.filter((transaction) => {
    const amountDiff = Math.abs(transaction.amount - order.money);
    const isAmountMatch = amountDiff < 0.01;
    const isNotLinked = !transaction.linkedDeliveryOrderIds || transaction.linkedDeliveryOrderIds.length === 0;
    
    // Check date match (same day in EST)
    // Both dates are stored in UTC but represent EST dates, so convert both to EST for comparison
    const transactionDate = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
    const transactionESTTimestamp = transactionDate.getTime() - (EST_OFFSET_HOURS * 60 * 60 * 1000);
    const transactionESTDate = new Date(transactionESTTimestamp);
    const transactionDateOnly = new Date(Date.UTC(
      transactionESTDate.getUTCFullYear(),
      transactionESTDate.getUTCMonth(),
      transactionESTDate.getUTCDate()
    ));
    const isDateMatch = orderDate.getTime() === transactionDateOnly.getTime();
    
    // Check hour match (same hour)
    // Parse transaction time string (format: "HH:MM" in EST)
    let isHourMatch = false;
    if (transaction.time) {
      const timeParts = transaction.time.split(":");
      if (timeParts.length === 2) {
        const transactionHourEST = parseInt(timeParts[0], 10);
        if (!isNaN(transactionHourEST)) {
          // Compare EST hours
          isHourMatch = orderHourEST === transactionHourEST;
        }
      }
    }
    
    return isAmountMatch && isNotLinked && isDateMatch && isHourMatch;
  });

  // Only auto-link if there is exactly one match
  if (amountMatchedTransactions.length !== 1) {
    return null;
  }

  const transaction = amountMatchedTransactions[0];

  // Perform the bidirectional link and set active to true
  await Transaction.findByIdAndUpdate(
    transaction._id,
    { 
      $addToSet: { linkedDeliveryOrderIds: order._id },
      $set: { active: true }
    },
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

/**
 * Attempts to auto-link a customer (OcrExport) to all active delivery orders.
 * Links to all active orders regardless of appName.
 * 
 * @param customer - The customer (OcrExport) to link
 * @param userId - The user ID for filtering
 * @returns Array of linked order IDs
 */
export async function attemptAutoLinkCustomerToActiveOrders(
  customer: any,
  userId: string
): Promise<string[]> {
  const linkedOrderIds: string[] = [];

  // Get customer ID (handle both Mongoose document and plain object)
  const customerId = customer._id ? (typeof customer._id === 'string' ? customer._id : customer._id.toString()) : (customer.id || null);
  if (!customerId) {
    console.warn("attemptAutoLinkCustomerToActiveOrders: customer has no _id", customer);
    return linkedOrderIds;
  }

  // Find all active transactions (income type, active: true) for this user
  const activeTransactions = await Transaction.find({
    userId,
    type: "income",
    active: true,
  }).lean();

  // Get all delivery order IDs from active transactions
  const activeOrderIds: string[] = [];
  for (const transaction of activeTransactions) {
    if (transaction.linkedDeliveryOrderIds && transaction.linkedDeliveryOrderIds.length > 0) {
      for (const orderId of transaction.linkedDeliveryOrderIds) {
        const orderIdStr = orderId.toString();
        if (!activeOrderIds.includes(orderIdStr)) {
          activeOrderIds.push(orderIdStr);
        }
      }
    }
  }

  console.log(`Found ${activeTransactions.length} active transaction(s) with ${activeOrderIds.length} linked delivery order(s)`);

  if (activeOrderIds.length === 0) {
    console.log(`No active delivery orders found to link for customer ${customerId}`);
    return linkedOrderIds;
  }

  // Find the delivery orders
  const activeOrders = await DeliveryOrder.find({
    _id: { $in: activeOrderIds },
    userId,
  }).lean();
  
  console.log(`Found ${activeOrders.length} active delivery order(s) to potentially link for customer ${customerId}`);

  // Also link customer to the transactions that have these active orders
  const linkedTransactionIds: string[] = [];
  for (const transaction of activeTransactions) {
    const transactionId = transaction._id.toString();
    
    // Skip if transaction already has this customer linked
    if (transaction.linkedOcrExportIds && transaction.linkedOcrExportIds.some((id: any) => 
      id.toString() === customerId
    )) {
      continue;
    }

    // Skip if customer already has this transaction linked
    if (customer.linkedTransactionIds && customer.linkedTransactionIds.some((id: any) => 
      id.toString() === transactionId
    )) {
      continue;
    }

    // Perform bidirectional link between customer and transaction
    await Transaction.findByIdAndUpdate(
      transaction._id,
      { $addToSet: { linkedOcrExportIds: customerId } },
      { new: true }
    );

    await OcrExport.findByIdAndUpdate(
      customerId,
      { $addToSet: { linkedTransactionIds: transaction._id } },
      { new: true }
    );

    linkedTransactionIds.push(transactionId);
    console.log(`Successfully linked customer ${customerId} to transaction ${transactionId}`);
  }

  // Link customer to each active order that isn't already linked
  for (const order of activeOrders) {
    const orderId = order._id.toString();
    
    // Skip if already linked
    if (order.linkedOcrExportIds && order.linkedOcrExportIds.some((id: any) => 
      id.toString() === customerId
    )) {
      console.log(`Order ${orderId} already linked to customer ${customerId}`);
      continue;
    }

    // Skip if customer already has this order linked
    if (customer.linkedDeliveryOrderIds && customer.linkedDeliveryOrderIds.some((id: any) => 
      id.toString() === orderId
    )) {
      console.log(`Customer ${customerId} already linked to order ${orderId}`);
      continue;
    }

    // Perform bidirectional link
    await DeliveryOrder.findByIdAndUpdate(
      order._id,
      { $addToSet: { linkedOcrExportIds: customerId } },
      { new: true }
    );

    await OcrExport.findByIdAndUpdate(
      customerId,
      { $addToSet: { linkedDeliveryOrderIds: order._id } },
      { new: true }
    );

    console.log(`Successfully linked customer ${customerId} to order ${orderId}`);
    linkedOrderIds.push(orderId);
  }

  console.log(`Auto-linked customer to ${linkedTransactionIds.length} active transaction(s) and ${linkedOrderIds.length} active order(s)`);
  return linkedOrderIds;
}
