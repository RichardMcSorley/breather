import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import UserSettings from "@/lib/models/UserSettings";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";
import Mileage from "@/lib/models/Mileage";
import Bill from "@/lib/models/Bill";
import { parseDateOnlyAsUTC } from "@/lib/date-utils";
import { TransactionQuery } from "@/lib/types";

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
    const viewMode = searchParams.get("viewMode") || "day";
    
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

    // Determine date range based on view mode
    let rangeStart: Date;
    let rangeEnd: Date;
    let todayStart: Date;
    let todayEnd: Date;
    
    if (viewMode === "year") {
      rangeStart = startOfYear(now);
      rangeEnd = endOfYear(now);
      // For year view, use the full year range
      todayStart = new Date(rangeStart);
      todayStart.setUTCHours(0, 0, 0, 0);
      todayEnd = new Date(rangeEnd);
      todayEnd.setUTCHours(23, 59, 59, 999);
    } else if (viewMode === "month") {
      rangeStart = startOfMonth(now);
      rangeEnd = endOfMonth(now);
      // For month view, use the full month range
      todayStart = new Date(rangeStart);
      todayStart.setUTCHours(0, 0, 0, 0);
      todayEnd = new Date(rangeEnd);
      todayEnd.setUTCHours(23, 59, 59, 999);
    } else {
      // Day view - use the selected day
      rangeStart = startOfMonth(now);
      rangeEnd = endOfMonth(now);
      // For today's range, manually set UTC hours to ensure we get the full day in UTC
      todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      todayEnd = new Date(now);
      todayEnd.setUTCHours(23, 59, 59, 999);
    }
    
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const thirtyDaysAgo = subDays(now, 30);

    const settings = await UserSettings.findOne({ userId: session.user.id }).lean();

    // Get transactions for the selected range (day/month/year)
    const transactionQuery: TransactionQuery = {
      userId: session.user.id,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    };

    const transactions = await Transaction.find(transactionQuery).lean();
    const relevantTransactions = transactions;

    // Get active bills
    const activeBills = await Bill.find({
      userId: session.user.id,
      isActive: true,
    }).lean();

    // Calculate bills due for the selected period
    let totalBillsDue = 0;
    let lastDueDate: Date | null = null;

    if (viewMode === "year") {
      // For year view, calculate bills for all months in the year
      const year = now.getUTCFullYear();
      for (let month = 0; month < 12; month++) {
        for (const bill of activeBills) {
          const dueDay = bill.dueDate;
          const billDueDate = new Date(Date.UTC(year, month, dueDay, 23, 59, 59, 999));
          
          // Only count bills within the year range
          if (billDueDate >= todayStart && billDueDate <= todayEnd) {
            totalBillsDue += bill.amount;
            if (!lastDueDate || billDueDate > lastDueDate) {
              lastDueDate = billDueDate;
            }
          }
        }
      }
    } else if (viewMode === "month") {
      // For month view, calculate bills for the selected month
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth();
      
      for (const bill of activeBills) {
        const dueDay = bill.dueDate;
        const billDueDate = new Date(Date.UTC(currentYear, currentMonth, dueDay, 23, 59, 59, 999));
        
        totalBillsDue += bill.amount;
        if (!lastDueDate || billDueDate > lastDueDate) {
          lastDueDate = billDueDate;
        }
      }
    } else {
      // For day view, calculate bills for the current month (existing logic)
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth();
      
      for (const bill of activeBills) {
        const dueDay = bill.dueDate;
        const billDueDate = new Date(Date.UTC(currentYear, currentMonth, dueDay, 23, 59, 59, 999));
        
        totalBillsDue += bill.amount;
        if (!lastDueDate || billDueDate > lastDueDate) {
          lastDueDate = billDueDate;
        }
      }
    }

    // Calculate days until last bill is due (can be negative if overdue)
    const daysUntilLastBill = lastDueDate ? differenceInDays(lastDueDate, now) : 0;

    // Get all mileage entries for the selected range
    const mileageStartDate = viewMode === "year" ? startOfYear(now) : viewMode === "month" ? startOfMonth(now) : thirtyDaysAgo;
    
    const mileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: mileageStartDate,
        $lte: todayEnd,
      },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // Get only work mileage entries for tax deduction calculation
    const workMileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: mileageStartDate,
        $lte: todayEnd,
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

    // Calculate actual days in the period
    let actualDays: number;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    if (viewMode === "year") {
      const yearStart = startOfYear(now);
      // Use the earlier of today or the end of the selected year
      const endDate = today < todayEnd ? today : todayEnd;
      const daysDiff = Math.floor((endDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
      actualDays = Math.max(daysDiff + 1, 1);
    } else if (viewMode === "month") {
      const monthStart = startOfMonth(now);
      // Use the earlier of today or the end of the selected month
      const endDate = today < todayEnd ? today : todayEnd;
      const daysDiff = Math.floor((endDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
      actualDays = Math.max(daysDiff + 1, 1);
    } else {
      actualDays = 1; // Day view is always 1 day
    }
    
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

    // For period earnings (day/month/year), show ALL transactions from the period
    // Only exclude bills from the display
    const allPeriodTransactions = await Transaction.find({
      userId: session.user.id,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    }).lean();
    
    const periodTransactions = allPeriodTransactions.filter((t) => {
      return !t.isBill;
    });

    const todayIncome = periodTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayExpenses = periodTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayNet = todayIncome - todayExpenses;

    // Calculate period's work mileage for tax deductions
    const periodWorkMileageEntries = await Mileage.find({
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
    if (periodWorkMileageEntries.length >= 2) {
      todayMileageMiles =
        periodWorkMileageEntries[periodWorkMileageEntries.length - 1].odometer -
        periodWorkMileageEntries[0].odometer;
    } else if (periodWorkMileageEntries.length === 1) {
      const previousWorkEntry = await Mileage.findOne({
        userId: session.user.id,
        date: { $lt: todayStart },
        classification: "work",
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      if (previousWorkEntry) {
        todayMileageMiles = Math.max(
          periodWorkMileageEntries[0].odometer - previousWorkEntry.odometer,
          0
        );
      }
    }

    const todayMileageSavings = todayMileageMiles * irsMileageRate;

    // Calculate earnings per mile for the selected period
    let earningsPerMile: number | null = null;
    if (todayMileageMiles > 0 && todayIncome > 0) {
      earningsPerMile = todayIncome / todayMileageMiles;
    }

    // Calculate earnings per hour based on time span from first to last income transaction
    let earningsPerHour: number | null = null;
    const incomeTransactions = periodTransactions.filter((t) => t.type === "income");
    if (incomeTransactions.length > 0 && todayIncome > 0) {
      // Parse times and find earliest and latest
      const times = incomeTransactions
        .map((t) => {
          const [hours, minutes] = (t.time || "00:00").split(":").map(Number);
          return hours * 60 + minutes; // Convert to minutes for easier comparison
        })
        .filter((minutes) => !isNaN(minutes));

      if (times.length > 0) {
        const earliestMinutes = Math.min(...times);
        const latestMinutes = Math.max(...times);
        const timeSpanMinutes = latestMinutes - earliestMinutes;
        
        // If there's only one transaction or they're at the same time, use a minimum of 1 hour
        const hoursWorked = Math.max(timeSpanMinutes / 60, 1.0);
        
        if (hoursWorked > 0) {
          earningsPerHour = todayIncome / hoursWorked;
        }
      }
    }

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
      earningsPerMile,
      earningsPerHour,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

