import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Bill from "@/lib/models/Bill";
import { handleApiError } from "@/lib/api-error-handler";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";

interface PaymentPlanEntry {
  date: string;
  bill: string;
  billId: string;
  payment: number;
  remainingBalance: number;
  dueDate: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { startDate, dailyPayment } = body;

    if (!startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    const maxPayment = dailyPayment ? parseFloat(dailyPayment) : 100.0;
    const startDateObj = parseDateOnlyAsUTC(startDate);
    const currentYear = startDateObj.getUTCFullYear();
    const currentMonth = startDateObj.getUTCMonth();

    // Get all bills (since we removed the active/inactive status from UI)
    const bills = await Bill.find({
      userId: session.user.id,
    }).lean();

    if (bills.length === 0) {
      return NextResponse.json({ error: "No bills found" }, { status: 400 });
    }

    // Process bills - convert to payment plan format
    // When generating a new plan, always start from full bill amounts (ignore existing payments)
    interface ProcessedBill {
      billId: string;
      name: string;
      amountDue: number;
      dueDate: string;
    }

    const processedBills: ProcessedBill[] = bills.map((bill) => {
      const dueDay = bill.dueDate;
      // Generate due date for current month
      const dueDate = new Date(Date.UTC(currentYear, currentMonth, dueDay));
      const billId = bill._id.toString();
      
      return {
        billId,
        name: bill.name,
        amountDue: bill.amount, // Always start from full bill amount
        dueDate: formatDateAsUTC(dueDate),
      };
    });

    // Sort bills by due date
    processedBills.sort((a, b) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      return dateA - dateB;
    });

    const dailyPaymentPlan: PaymentPlanEntry[] = [];
    // Create currentDate using UTC components to avoid timezone issues
    let currentDate = new Date(Date.UTC(
      startDateObj.getUTCFullYear(),
      startDateObj.getUTCMonth(),
      startDateObj.getUTCDate()
    ));
    const billsCopy = processedBills.map((bill) => ({ ...bill }));

    // Allocate payments per day
    while (billsCopy.length > 0) {
      // Re-sort daily to prioritize earlier due dates
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

      // Remove fully paid bills
      billsCopy.splice(0, billsCopy.length, ...billsCopy.filter((bill) => bill.amountDue > 0));

      // Move to next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);

      // Safety limit to prevent infinite loops
      const daysSinceStart = Math.floor(
        (currentDate.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceStart > 365) {
        break;
      }
    }

    // Group payments by date
    const groupedByDate: Record<string, PaymentPlanEntry[]> = {};
    dailyPaymentPlan.forEach((entry) => {
      if (!groupedByDate[entry.date]) {
        groupedByDate[entry.date] = [];
      }
      groupedByDate[entry.date].push(entry);
    });

    return NextResponse.json({
      paymentPlan: dailyPaymentPlan,
      groupedByDate,
      warnings: billsCopy.length > 0 ? ["Some bills could not be fully paid within the time limit"] : [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

