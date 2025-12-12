import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import UserSettings from "@/lib/models/UserSettings";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, differenceInDays } from "date-fns";
import Mileage from "@/lib/models/Mileage";
import Bill from "@/lib/models/Bill";
import { parseDateOnlyAsUTC } from "@/lib/date-utils";
import { TransactionQuery } from "@/lib/types";

/**
 * Calculate total mileage from entries, grouping by vehicle (carId).
 * Only counts differences between consecutive entries for the same vehicle.
 * The first entry for each vehicle is skipped (no previous reading to compare).
 */
export function calculateMileageByVehicle(
  entries: Array<{ odometer: number; date: Date; carId?: string }>,
  previousEntries?: Array<{ odometer: number; date: Date; carId?: string }>
): number {
  if (entries.length === 0) return 0;

  // Group entries by carId (undefined/null treated as single group)
  const entriesByVehicle = new Map<string | null, typeof entries>();
  
  entries.forEach(entry => {
    const vehicleKey = entry.carId || null;
    if (!entriesByVehicle.has(vehicleKey)) {
      entriesByVehicle.set(vehicleKey, []);
    }
    entriesByVehicle.get(vehicleKey)!.push(entry);
  });

  // If we have previous entries, include them for finding the first entry per vehicle
  const previousByVehicle = new Map<string | null, typeof entries>();
  if (previousEntries) {
    previousEntries.forEach(entry => {
      const vehicleKey = entry.carId || null;
      if (!previousByVehicle.has(vehicleKey)) {
        previousByVehicle.set(vehicleKey, []);
      }
      previousByVehicle.get(vehicleKey)!.push(entry);
    });
  }

  let totalMiles = 0;

  // Process each vehicle group
  entriesByVehicle.forEach((vehicleEntries, vehicleKey) => {
    // Sort entries by date (ascending) for this vehicle
    const sortedEntries = [...vehicleEntries].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      // If same date, use odometer as tiebreaker (lower odometer = earlier)
      return a.odometer - b.odometer;
    });

    // Check if this vehicle has any previous entries
    const previousVehicleEntries = previousByVehicle.get(vehicleKey) || [];
    const hasPreviousEntries = previousVehicleEntries.length > 0;

    // Calculate differences between consecutive entries
    // Skip the first entry if there are no previous entries for this vehicle
    const startIndex = hasPreviousEntries ? 0 : 1;

    for (let i = startIndex; i < sortedEntries.length; i++) {
      const currentEntry = sortedEntries[i];
      let previousEntry: typeof currentEntry | undefined;

      if (i === 0 && hasPreviousEntries) {
        // Use the most recent previous entry for this vehicle
        const sortedPrevious = [...previousVehicleEntries].sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateB - dateA; // Descending for most recent
          return b.odometer - a.odometer;
        });
        previousEntry = sortedPrevious[0];
      } else if (i > 0) {
        // Use the previous entry in the current period
        previousEntry = sortedEntries[i - 1];
      }

      if (previousEntry) {
        const miles = currentEntry.odometer - previousEntry.odometer;
        if (miles > 0) {
          totalMiles += miles;
        }
      }
    }
  });

  return totalMiles;
}

export interface SummaryResult {
  grossTotal: number;
  variableExpenses: number;
  freeCash: number;
  dailyBurnRate: number;
  netDailyCashFlow: number;
  netDailyCashFlowWithAllExpenses: number;
  daysToBreakEven: number;
  totalBillsDue: number;
  unpaidBills: number;
  daysUntilLastBill: number;
  irsMileageRate: number;
  mileageMilesLast30: number;
  mileageSavings: number;
  todayIncome: number;
  todayExpenses: number;
  todayNet: number;
  todayMileageMiles: number;
  todayMileageSavings: number;
  earningsPerMile: number | null;
  earningsPerHour: number | null;
  incomeBreakdown: Array<{ source: string; amount: number }>;
}

export async function calculateSummary(
  userId: string,
  localDateStr: string | null,
  viewMode: string
): Promise<SummaryResult> {
  await connectDB();

  let now: Date;
  if (localDateStr) {
    now = parseDateOnlyAsUTC(localDateStr);
  } else {
    const serverNow = new Date();
    const utcYear = serverNow.getUTCFullYear();
    const utcMonth = serverNow.getUTCMonth();
    const utcDay = serverNow.getUTCDate();
    now = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
  }

  // Determine date range based on view mode
  let todayStart: Date;
  let todayEnd: Date;
  
  if (viewMode === "year") {
    const year = now.getUTCFullYear();
    todayStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    todayEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  } else if (viewMode === "month") {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    todayStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    todayEnd = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
  } else {
    todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);
  }
  
  const monthStart = startOfMonth(now);
  const thirtyDaysAgo = subDays(now, 30);

  // Parallelize independent queries
  const [settings, transactions, activeBills] = await Promise.all([
    UserSettings.findOne({ userId }).lean(),
    Transaction.find({
      userId,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    }).lean(),
    Bill.find({
      userId,
      isActive: true,
    }).lean(),
  ]);

  const relevantTransactions = transactions;

  // Calculate bills due for the selected period
  let totalBillsDue = 0;
  let lastDueDate: Date | null = null;

  if (viewMode === "year") {
    const year = now.getUTCFullYear();
    for (let month = 0; month < 12; month++) {
      for (const bill of activeBills) {
        const dueDay = bill.dueDate;
        const billDueDate = new Date(Date.UTC(year, month, dueDay, 23, 59, 59, 999));
        
        if (billDueDate >= todayStart && billDueDate <= todayEnd) {
          totalBillsDue += bill.amount;
          if (!lastDueDate || billDueDate > lastDueDate) {
            lastDueDate = billDueDate;
          }
        }
      }
    }
  } else if (viewMode === "month") {
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

  const daysUntilLastBill = lastDueDate ? differenceInDays(lastDueDate, now) : 0;

  const mileageStartDate = viewMode === "year" ? startOfYear(now) : viewMode === "month" ? startOfMonth(now) : thirtyDaysAgo;
  
  // Parallelize mileage queries
  const [workMileageEntries, previousWorkEntries] = await Promise.all([
    Mileage.find({
      userId,
      date: {
        $gte: mileageStartDate,
        $lte: todayEnd,
      },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean(),
    Mileage.find({
      userId,
      date: { $lt: mileageStartDate },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean(),
  ]);

  const mileageMilesLast30 = calculateMileageByVehicle(
    workMileageEntries,
    previousWorkEntries
  );

  const irsMileageRate = settings?.irsMileageDeduction ?? 0.70;
  const mileageSavings = mileageMilesLast30 * irsMileageRate;

  const transactionGrossTotal = relevantTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const variableExpenses = relevantTransactions
    .filter((t) => t.type === "expense" && !t.isBill)
    .reduce((sum, t) => sum + t.amount, 0);

  const billExpenses = relevantTransactions
    .filter((t) => t.type === "expense" && t.isBill)
    .reduce((sum, t) => sum + t.amount, 0);

  const unpaidBills = Math.max(0, totalBillsDue - billExpenses);
  const grossTotal = transactionGrossTotal;
  const freeCash = grossTotal - variableExpenses - totalBillsDue;

  let actualDays: number;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  if (viewMode === "year") {
    const yearStart = startOfYear(now);
    const endDate = today < todayEnd ? today : todayEnd;
    const daysDiff = Math.floor((endDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    actualDays = Math.max(daysDiff + 1, 1);
  } else if (viewMode === "month") {
    const monthStart = startOfMonth(now);
    const endDate = today < todayEnd ? today : todayEnd;
    const daysDiff = Math.floor((endDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
    actualDays = Math.max(daysDiff + 1, 1);
  } else {
    actualDays = 1;
  }
  
  const averageDailyIncome = grossTotal / actualDays;
  const totalExpenses = variableExpenses + billExpenses;
  const averageDailyExpenses = totalExpenses / actualDays;
  const netDailyCashFlow = averageDailyIncome - averageDailyExpenses;
  const netDailyCashFlowWithAllExpenses = netDailyCashFlow;
  
  let dailyBurnRate = 0;
  if (netDailyCashFlowWithAllExpenses !== 0) {
    dailyBurnRate = Math.abs(netDailyCashFlowWithAllExpenses);
  } else if (averageDailyExpenses > 0) {
    dailyBurnRate = averageDailyExpenses;
  }

  let daysToBreakEven = 0;
  if (unpaidBills > 0) {
    const shortfall = unpaidBills - freeCash;
    if (shortfall <= 0) {
      daysToBreakEven = Math.max(0, daysUntilLastBill);
    } else {
      if (averageDailyIncome > 0) {
        daysToBreakEven = Math.ceil(shortfall / averageDailyIncome);
      } else {
        daysToBreakEven = daysUntilLastBill;
      }
    }
  } else if (totalBillsDue > 0) {
    daysToBreakEven = Math.max(0, daysUntilLastBill);
  }

  // Get period transactions
  const allPeriodTransactions = await Transaction.find({
    userId,
    date: {
      $gte: todayStart,
      $lte: todayEnd,
    },
  }).lean();
  
  const periodTransactions = allPeriodTransactions.filter((t) => !t.isBill);

  const todayIncome = periodTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const todayExpenses = periodTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const todayNet = todayIncome - todayExpenses;

  // Get period work mileage
  const [periodWorkMileageEntries, previousPeriodWorkEntries] = await Promise.all([
    Mileage.find({
      userId,
      date: {
        $gte: todayStart,
        $lte: todayEnd,
      },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean(),
    Mileage.find({
      userId,
      date: { $lt: todayStart },
      classification: "work",
    })
      .sort({ date: 1, createdAt: 1 })
      .lean(),
  ]);

  const todayMileageMiles = calculateMileageByVehicle(
    periodWorkMileageEntries,
    previousPeriodWorkEntries
  );

  const todayMileageSavings = todayMileageMiles * irsMileageRate;

  let earningsPerMile: number | null = null;
  if (todayMileageMiles > 0 && todayIncome > 0) {
    earningsPerMile = todayIncome / todayMileageMiles;
  }

  let earningsPerHour: number | null = null;
  const incomeTransactions = periodTransactions.filter((t) => t.type === "income");
  
  if (incomeTransactions.length > 0 && todayIncome > 0) {
    if (viewMode === "day") {
      const times = incomeTransactions
        .map((t) => {
          const [hours, minutes] = (t.time || "00:00").split(":").map(Number);
          return hours * 60 + minutes;
        })
        .filter((minutes) => !isNaN(minutes));

      if (times.length > 0) {
        const earliestMinutes = Math.min(...times);
        const latestMinutes = Math.max(...times);
        const timeSpanMinutes = latestMinutes - earliestMinutes;
        const hoursWorked = Math.max(timeSpanMinutes / 60, 1.0);
        
        if (hoursWorked > 0) {
          earningsPerHour = todayIncome / hoursWorked;
        }
      }
    } else {
      const transactionsByDate: Record<string, typeof incomeTransactions> = {};
      
      incomeTransactions.forEach((t) => {
        const dateStr = new Date(t.date).toISOString().split('T')[0];
        if (!transactionsByDate[dateStr]) {
          transactionsByDate[dateStr] = [];
        }
        transactionsByDate[dateStr].push(t);
      });
      
      const dailyHours: number[] = [];
      Object.values(transactionsByDate).forEach((dayTransactions) => {
        const times = dayTransactions
          .map((t) => {
            const [hours, minutes] = (t.time || "00:00").split(":").map(Number);
            return hours * 60 + minutes;
          })
          .filter((minutes) => !isNaN(minutes));
        
        if (times.length > 0) {
          const earliestMinutes = Math.min(...times);
          const latestMinutes = Math.max(...times);
          const timeSpanMinutes = latestMinutes - earliestMinutes;
          const hoursWorked = Math.max(timeSpanMinutes / 60, 1.0);
          dailyHours.push(hoursWorked);
        }
      });
      
      if (dailyHours.length > 0) {
        const averageHoursPerDay = dailyHours.reduce((sum, hours) => sum + hours, 0) / dailyHours.length;
        const totalHours = averageHoursPerDay * actualDays;
        
        if (totalHours > 0) {
          earningsPerHour = todayIncome / totalHours;
        }
      }
    }
  }

  const incomeBySource: Record<string, number> = {};
  incomeTransactions.forEach((t) => {
    if (t.tag) {
      incomeBySource[t.tag] = (incomeBySource[t.tag] || 0) + t.amount;
    }
  });

  const incomeBreakdown = Object.entries(incomeBySource)
    .map(([source, amount]) => ({ source, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
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
    incomeBreakdown,
  };
}
