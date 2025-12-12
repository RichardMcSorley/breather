import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import { calculateSummary } from "@/lib/summary-calculator";
import BillPayment from "@/lib/models/BillPayment";
import Bill from "@/lib/models/Bill";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { parseFloatSafe } from "@/lib/validation";

/**
 * Server-side data fetching functions for dashboard
 * These can be used directly in Server Components
 */

export async function getDashboardSummary(localDate: string, viewMode: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return calculateSummary(session.user.id, localDate, viewMode);
}

export async function getBillPayments() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const payments = await BillPayment.find({ userId: session.user.id })
    .populate("billId", "name company")
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();

  const formattedPayments = payments.map((payment) => ({
    ...payment,
    _id: payment._id.toString(),
    billId: typeof payment.billId === "object" && payment.billId !== null
      ? payment.billId
      : payment.billId != null
      ? payment.billId.toString()
      : "",
    paymentDate: payment.paymentDate ? formatDateAsUTC(new Date(payment.paymentDate)) : "",
    createdAt: payment.createdAt ? payment.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: payment.updatedAt ? payment.updatedAt.toISOString() : new Date().toISOString(),
  }));

  return { payments: formattedPayments };
}

export async function getPaymentPlan(startDate: string, dailyPayment: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  if (!startDate) {
    throw new Error("Start date is required");
  }

  const parsedDailyPayment = dailyPayment ? parseFloatSafe(dailyPayment, 0) : null;
  const maxPayment = parsedDailyPayment !== null ? parsedDailyPayment : 100.0;
  const startDateObj = parseDateOnlyAsUTC(startDate);
  const currentYear = startDateObj.getUTCFullYear();
  const currentMonth = startDateObj.getUTCMonth();

  const bills = await Bill.find({
    userId: session.user.id,
    useInPlan: true,
  }).lean();

  if (bills.length === 0) {
    throw new Error("No bills found");
  }

  interface ProcessedBill {
    billId: string;
    name: string;
    amountDue: number;
    dueDate: string;
  }

  const processedBills: ProcessedBill[] = bills.map((bill) => {
    const dueDay = bill.dueDate;
    let dueDate = new Date(Date.UTC(currentYear, currentMonth, dueDay));
    
    if (dueDate < startDateObj) {
      let nextMonth = currentMonth + 1;
      let nextYear = currentYear;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      dueDate = new Date(Date.UTC(nextYear, nextMonth, dueDay));
    }
    
    const billId = bill._id.toString();
    
    return {
      billId,
      name: bill.name,
      amountDue: bill.amount,
      dueDate: formatDateAsUTC(dueDate),
    };
  });

  processedBills.sort((a, b) => {
    const dateA = new Date(a.dueDate).getTime();
    const dateB = new Date(b.dueDate).getTime();
    return dateA - dateB;
  });

  interface PaymentPlanEntry {
    date: string;
    bill: string;
    billId: string;
    payment: number;
    remainingBalance: number;
    dueDate: string;
  }

  const dailyPaymentPlan: PaymentPlanEntry[] = [];
  let currentDate = new Date(Date.UTC(
    startDateObj.getUTCFullYear(),
    startDateObj.getUTCMonth(),
    startDateObj.getUTCDate()
  ));
  const billsCopy = processedBills.map((bill) => ({ ...bill }));

  while (billsCopy.length > 0) {
    billsCopy.sort((a, b) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      return dateA - dateB;
    });

    let remainingPayment = maxPayment;

    for (const bill of billsCopy) {
      if (remainingPayment > 0 && bill.amountDue > 0) {
        const payment = Math.min(remainingPayment, bill.amountDue);
        bill.amountDue -= payment;
        remainingPayment -= payment;

        dailyPaymentPlan.push({
          date: formatDateAsUTC(currentDate),
          bill: bill.name,
          billId: bill.billId,
          payment: Math.round(payment * 100) / 100,
          remainingBalance: Math.round(bill.amountDue * 100) / 100,
          dueDate: bill.dueDate,
        });
      }
    }

    billsCopy.splice(0, billsCopy.length, ...billsCopy.filter((bill) => bill.amountDue > 0));

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);

    const daysSinceStart = Math.floor(
      (currentDate.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceStart > 365) {
      break;
    }
  }

  const groupedByDate: Record<string, PaymentPlanEntry[]> = {};
  dailyPaymentPlan.forEach((entry) => {
    if (!groupedByDate[entry.date]) {
      groupedByDate[entry.date] = [];
    }
    groupedByDate[entry.date].push(entry);
  });

  return {
    paymentPlan: dailyPaymentPlan,
    groupedByDate,
    warnings: billsCopy.length > 0 ? ["Some bills could not be fully paid within the time limit"] : [],
  };
}
