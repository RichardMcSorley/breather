import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import UserSettings from "@/lib/models/UserSettings";
import { startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { handleApiError } from "@/lib/api-error-handler";
import Mileage from "@/lib/models/Mileage";
import Bill from "@/lib/models/Bill";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const thirtyDaysAgo = subDays(now, 30);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const transactions = await Transaction.find({
      userId: session.user.id,
      date: {
        $gte: monthStart,
        $lte: monthEnd,
      },
    }).lean();

    const settings = await UserSettings.findOne({ userId: session.user.id }).lean();

    // Get active bills for the current month
    const activeBills = await Bill.find({
      userId: session.user.id,
      isActive: true,
    }).lean();

    // Calculate bills due this month and their actual due dates
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let totalBillsDue = 0;
    let lastDueDate: Date | null = null;

    for (const bill of activeBills) {
      // Calculate the actual due date for this month
      const dueDay = bill.dueDate;
      // Create date for this month's due date
      const billDueDate = new Date(currentYear, currentMonth, dueDay);
      // Set time to end of day to avoid timezone issues
      billDueDate.setHours(23, 59, 59, 999);

      totalBillsDue += bill.amount;
      
      // Track the latest due date (whether past or future)
      if (!lastDueDate || billDueDate > lastDueDate) {
        lastDueDate = billDueDate;
      }
    }

    // Calculate days until last bill is due (can be negative if overdue)
    const daysUntilLastBill = lastDueDate ? differenceInDays(lastDueDate, now) : 0;

    const mileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: thirtyDaysAgo,
      },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    let mileageMilesLast30 = 0;
    if (mileageEntries.length >= 2) {
      mileageMilesLast30 =
        mileageEntries[mileageEntries.length - 1].odometer -
        mileageEntries[0].odometer;
    } else if (mileageEntries.length === 1) {
      const previousEntry = await Mileage.findOne({
        userId: session.user.id,
        date: { $lt: thirtyDaysAgo },
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      if (previousEntry) {
        mileageMilesLast30 = Math.max(
          mileageEntries[0].odometer - previousEntry.odometer,
          0
        );
      }
    }

    const irsMileageRate = settings?.irsMileageDeduction ?? 0.67;
    const mileageSavings = mileageMilesLast30 * irsMileageRate;

    const transactionGrossTotal = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const variableExpenses = transactions
      .filter((t) => t.type === "expense" && !t.isBill)
      .reduce((sum, t) => sum + t.amount, 0);

    // Bill expenses from transactions only (bills that have been paid this month)
    const billExpenses = transactions
      .filter((t) => t.type === "expense" && t.isBill)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate unpaid bills (total bills due minus bills already paid)
    const unpaidBills = Math.max(0, totalBillsDue - billExpenses);

    const liquidCash = settings?.liquidCash || 0;
    const taxShield = transactionGrossTotal * ((settings?.estimatedTaxRate || 0) / 100);
    const fixedExpenses = settings?.fixedExpenses || 0;

    // Add liquid cash to gross total (it's already after-tax, so we add it after tax shield calculation)
    const grossTotal = transactionGrossTotal + liquidCash;

    // Free cash = income - variable expenses - bill expenses (from transactions) - tax shield - fixed expenses
    const freeCash = grossTotal - variableExpenses - billExpenses - taxShield - fixedExpenses;

    // Calculate actual daily patterns from transactions
    const daysInMonth = now.getDate(); // Days that have passed this month
    const actualDays = Math.max(daysInMonth, 1); // At least 1 day to avoid division by zero
    
    // Calculate average daily income
    const averageDailyIncome = grossTotal / actualDays;
    
    // Calculate average daily expenses (variable + bills)
    const totalExpenses = variableExpenses + billExpenses;
    const averageDailyExpenses = totalExpenses / actualDays;
    
    // Net daily cash flow (income - expenses per day, excluding fixed expenses and tax shield)
    const netDailyCashFlow = averageDailyIncome - averageDailyExpenses;
    
    // Calculate total daily expenses including fixed expenses and tax shield
    // Fixed expenses and tax shield are monthly, so divide by 30 for daily
    const dailyFixedExpenses = fixedExpenses / 30;
    const dailyTaxShield = taxShield / 30;
    const totalDailyExpenses = averageDailyExpenses + dailyFixedExpenses + dailyTaxShield;
    
    // Net daily cash flow including all expenses (matches freeCash calculation)
    const netDailyCashFlowWithAllExpenses = averageDailyIncome - totalDailyExpenses;
    
    // Calculate daily burn rate for break-even calculation
    let dailyBurnRate = 0;
    
    if (settings?.monthlyBurnRate && settings.monthlyBurnRate > 0) {
      // Use configured monthly burn rate if set
      dailyBurnRate = settings.monthlyBurnRate / 30;
    } else if (netDailyCashFlowWithAllExpenses !== 0) {
      // Estimate based on actual daily cash flow including all expenses
      dailyBurnRate = Math.abs(netDailyCashFlowWithAllExpenses);
    } else if (totalDailyExpenses > 0) {
      // If no income but there are expenses, use total expense rate
      dailyBurnRate = totalDailyExpenses;
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

    const todayTransactions = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return transactionDate >= todayStart && transactionDate <= todayEnd && !t.isBill;
    });

    const todayIncome = todayTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayExpenses = todayTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const todayNet = todayIncome - todayExpenses;

    // Calculate today's mileage
    const todayMileageEntries = await Mileage.find({
      userId: session.user.id,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    let todayMileageMiles = 0;
    if (todayMileageEntries.length >= 2) {
      todayMileageMiles =
        todayMileageEntries[todayMileageEntries.length - 1].odometer -
        todayMileageEntries[0].odometer;
    } else if (todayMileageEntries.length === 1) {
      const previousEntry = await Mileage.findOne({
        userId: session.user.id,
        date: { $lt: todayStart },
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      if (previousEntry) {
        todayMileageMiles = Math.max(
          todayMileageEntries[0].odometer - previousEntry.odometer,
          0
        );
      }
    }

    const todayMileageSavings = todayMileageMiles * irsMileageRate;

    return NextResponse.json({
      grossTotal,
      variableExpenses,
      taxShield,
      fixedExpenses,
      freeCash,
      dailyBurnRate: dailyBurnRate || (settings?.monthlyBurnRate || 0) / 30,
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

