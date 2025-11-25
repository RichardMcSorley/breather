import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import UserSettings from "@/lib/models/UserSettings";
import { startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";
import Mileage from "@/lib/models/Mileage";
import Bill from "@/lib/models/Bill";
import { parseDateOnlyAsUTC } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get user's local date from query params if provided, otherwise use server date
    const { searchParams } = new URL(request.url);
    const localDateStr = searchParams.get("localDate");
    
    let now: Date;
    if (localDateStr) {
      // Parse user's local date (YYYY-MM-DD format) as UTC
      // The date string represents the user's local date, but we treat it as UTC for consistency
      now = parseDateOnlyAsUTC(localDateStr);
    } else {
      // Fallback to server's current UTC date/time
      const serverNow = new Date();
      // Get UTC date components and create a UTC date at midnight
      const utcYear = serverNow.getUTCFullYear();
      const utcMonth = serverNow.getUTCMonth();
      const utcDay = serverNow.getUTCDate();
      now = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
    }

    // Use date-fns functions - they work with Date objects
    // Since we're using UTC dates, the calculations will be correct
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const thirtyDaysAgo = subDays(now, 30);
    
    // For today's range, manually set UTC hours to ensure we get the full day in UTC
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    const settings = await UserSettings.findOne({ userId: session.user.id }).lean();

    // Get transactions for the current month
    const transactionQuery: any = {
      userId: session.user.id,
      date: {
        $gte: monthStart,
        $lte: monthEnd,
      },
    };

    const transactions = await Transaction.find(transactionQuery).lean();
    const relevantTransactions = transactions;

    // Get active bills for the current month
    const activeBills = await Bill.find({
      userId: session.user.id,
      isActive: true,
    }).lean();

    // Calculate bills due this month and their actual due dates
    // Use UTC methods to get year/month
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();

    let totalBillsDue = 0;
    let lastDueDate: Date | null = null;

    for (const bill of activeBills) {
      // Calculate the actual due date for this month in UTC
      const dueDay = bill.dueDate;
      // Create date for this month's due date in UTC
      const billDueDate = new Date(Date.UTC(currentYear, currentMonth, dueDay, 23, 59, 59, 999));

      totalBillsDue += bill.amount;
      
      // Track the latest due date (whether past or future)
      if (!lastDueDate || billDueDate > lastDueDate) {
        lastDueDate = billDueDate;
      }
    }

    // Calculate days until last bill is due (can be negative if overdue)
    const daysUntilLastBill = lastDueDate ? differenceInDays(lastDueDate, now) : 0;

    // Get all mileage entries (for total calculation)
    const mileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: thirtyDaysAgo,
      },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // Get only work mileage entries for tax deduction calculation
    const workMileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: thirtyDaysAgo,
      },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    let mileageMilesLast30 = 0;
    // Calculate work miles only for tax deductions
    if (workMileageEntries.length >= 2) {
      mileageMilesLast30 =
        workMileageEntries[workMileageEntries.length - 1].odometer -
        workMileageEntries[0].odometer;
    } else if (workMileageEntries.length === 1) {
      const previousWorkEntry = await Mileage.findOne({
        userId: session.user.id,
        date: { $lt: thirtyDaysAgo },
        classification: "work",
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      if (previousWorkEntry) {
        mileageMilesLast30 = Math.max(
          workMileageEntries[0].odometer - previousWorkEntry.odometer,
          0
        );
      }
    }

    const irsMileageRate = settings?.irsMileageDeduction ?? 0.70;
    const mileageSavings = mileageMilesLast30 * irsMileageRate;

    // Filter to only include income transactions
    const transactionGrossTotal = relevantTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const variableExpenses = relevantTransactions
      .filter((t) => t.type === "expense" && !t.isBill)
      .reduce((sum, t) => sum + t.amount, 0);

    // Bill expenses from transactions only (bills that have been paid this month)
    const billExpenses = relevantTransactions
      .filter((t) => t.type === "expense" && t.isBill)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate unpaid bills (total bills due minus bills already paid)
    const unpaidBills = Math.max(0, totalBillsDue - billExpenses);

    // Gross total is just income transactions
    const grossTotal = transactionGrossTotal;

    // Free cash = income - variable expenses - total bills due (all bills for the month)
    const freeCash = grossTotal - variableExpenses - totalBillsDue;

    // Calculate actual daily patterns from transactions
    const daysInMonth = now.getDate(); // Days that have passed this month
    const actualDays = Math.max(daysInMonth, 1); // At least 1 day to avoid division by zero
    
    // Calculate average daily income
    const averageDailyIncome = grossTotal / actualDays;
    
    // Calculate average daily expenses (variable + bills)
    const totalExpenses = variableExpenses + billExpenses;
    const averageDailyExpenses = totalExpenses / actualDays;
    
    // Net daily cash flow (income - expenses per day)
    const netDailyCashFlow = averageDailyIncome - averageDailyExpenses;
    
    // Net daily cash flow matches freeCash calculation
    const netDailyCashFlowWithAllExpenses = netDailyCashFlow;
    
    // Calculate daily burn rate for break-even calculation
    let dailyBurnRate = 0;
    
    if (netDailyCashFlowWithAllExpenses !== 0) {
      // Estimate based on actual daily cash flow
      dailyBurnRate = Math.abs(netDailyCashFlowWithAllExpenses);
    } else if (averageDailyExpenses > 0) {
      // If no income but there are expenses, use expense rate
      dailyBurnRate = averageDailyExpenses;
    }

    // Calculate days to break even based on unpaid bills
    // This is how many days until we have enough cash to pay all unpaid bills
    let daysToBreakEven = 0;
    if (unpaidBills > 0) {
      // Calculate how much more we need (unpaid bills minus free cash)
      // If freeCash is negative, we need unpaidBills + abs(freeCash)
      // If freeCash is positive but less than unpaidBills, we need unpaidBills - freeCash
      const shortfall = unpaidBills - freeCash;
      
      if (shortfall <= 0) {
        // Have enough cash to cover all unpaid bills
        // Show days until last bill is due (or 0 if overdue)
        daysToBreakEven = Math.max(0, daysUntilLastBill);
      } else {
        // Need to earn the shortfall amount
        // Use daily income rate, not burn rate
        if (averageDailyIncome > 0) {
          // Calculate how many days it will take to earn enough at current daily income rate
          daysToBreakEven = Math.ceil(shortfall / averageDailyIncome);
        } else {
          // No income, can't calculate - show days until last bill
          daysToBreakEven = daysUntilLastBill;
        }
      }
    } else if (totalBillsDue > 0) {
      // All bills are paid, show days until last bill
      daysToBreakEven = Math.max(0, daysUntilLastBill);
    }

    // For today's earnings, show ALL transactions from today
    // Only exclude bills from today's display
    const allTodayTransactions = await Transaction.find({
      userId: session.user.id,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    }).lean();
    
    const todayTransactions = allTodayTransactions.filter((t) => {
      return !t.isBill;
    });

    const todayIncome = todayTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayExpenses = todayTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayNet = todayIncome - todayExpenses;

    // Calculate today's work mileage for tax deductions
    const todayWorkMileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    let todayMileageMiles = 0;
    if (todayWorkMileageEntries.length >= 2) {
      todayMileageMiles =
        todayWorkMileageEntries[todayWorkMileageEntries.length - 1].odometer -
        todayWorkMileageEntries[0].odometer;
    } else if (todayWorkMileageEntries.length === 1) {
      const previousWorkEntry = await Mileage.findOne({
        userId: session.user.id,
        date: { $lt: todayStart },
        classification: "work",
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      if (previousWorkEntry) {
        todayMileageMiles = Math.max(
          todayWorkMileageEntries[0].odometer - previousWorkEntry.odometer,
          0
        );
      }
    }

    const todayMileageSavings = todayMileageMiles * irsMileageRate;

    return NextResponse.json({
      grossTotal,
      variableExpenses,
      freeCash,
      dailyBurnRate,
      netDailyCashFlow,
      netDailyCashFlowWithAllExpenses,
      daysToBreakEven,
      totalBillsDue,
      unpaidBills,
      daysUntilLastBill,
      irsMileageRate,
      mileageMilesLast30,
      mileageSavings,
      todayIncome,
      todayExpenses,
      todayNet,
      todayMileageMiles,
      todayMileageSavings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

