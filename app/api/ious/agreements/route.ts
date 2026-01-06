import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import DailyRateAgreement from "@/lib/models/DailyRateAgreement";
import IOU from "@/lib/models/IOU";
import IOUPayment from "@/lib/models/IOUPayment";
import { handleApiError } from "@/lib/api-error-handler";
import { parseFloatSafe, sanitizeString } from "@/lib/validation";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { DailyRateAgreementStatus, DailyRateDay } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const includeStatus = searchParams.get("includeStatus") === "true";

    const agreements = await DailyRateAgreement.find({
      userId: session.user.id,
      isActive: true,
    }).sort({ personName: 1 }).lean();

    const formattedAgreements = agreements.map((agreement) => ({
      ...agreement,
      _id: agreement._id.toString(),
      startDate: agreement.startDate ? formatDateAsUTC(new Date(agreement.startDate)) : "",
      createdAt: agreement.createdAt ? agreement.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: agreement.updatedAt ? agreement.updatedAt.toISOString() : new Date().toISOString(),
    }));

    if (!includeStatus) {
      return NextResponse.json({ agreements: formattedAgreements });
    }

    // Calculate status for each agreement
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    const statuses: DailyRateAgreementStatus[] = await Promise.all(
      formattedAgreements.map(async (agreement) => {
        const startDate = parseDateOnlyAsUTC(agreement.startDate);

        // Calculate days elapsed (inclusive of start date)
        const daysElapsed = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const expectedTotal = daysElapsed * agreement.dailyRate;

        // Get all IOUs for this person (to calculate what must be paid off first)
        const ious = await IOU.find({
          userId: session.user.id,
          personName: agreement.personName,
          isActive: true,
        }).lean();
        const totalIOUsOwed = ious.reduce((sum, iou) => sum + iou.amount, 0);

        // Get all payments for this person
        const payments = await IOUPayment.find({
          userId: session.user.id,
          personName: agreement.personName,
        }).lean();
        const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

        // Payments first go toward IOUs, only excess counts toward agreement
        const paymentsAfterIOUs = Math.max(0, totalPayments - totalIOUsOwed);
        const runningBalance = expectedTotal - paymentsAfterIOUs;
        const daysAhead = Math.floor(-runningBalance / agreement.dailyRate);

        // Calculate current month stats
        const effectiveMonthStart = startDate > currentMonthStart ? startDate : currentMonthStart;
        const daysInCurrentMonth = Math.max(0, Math.floor((today.getTime() - effectiveMonthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const currentMonthExpected = startDate <= today ? daysInCurrentMonth * agreement.dailyRate : 0;

        // For monthly, we still show all payments this month (user can see raw payment activity)
        const currentMonthPayments = payments.filter((p) => {
          const paymentDate = new Date(p.paymentDate);
          return paymentDate >= currentMonthStart && paymentDate <= currentMonthEnd;
        });
        const currentMonthPaid = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);

        // Monthly balance considers IOU debt as well
        // If IOUs aren't paid off yet, monthly balance reflects that
        const iouRemainingDebt = Math.max(0, totalIOUsOwed - totalPayments);
        const currentMonthBalance = currentMonthExpected - currentMonthPaid + iouRemainingDebt;

        // Generate daily breakdown (most recent first, limited to last 60 days for performance)
        const dailyBreakdown: DailyRateDay[] = [];
        const maxDaysToShow = Math.min(daysElapsed, 60);

        for (let i = 0; i < maxDaysToShow; i++) {
          const dayNumber = daysElapsed - i;
          const dayDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = formatDateAsUTC(dayDate);

          const cumulativeExpected = dayNumber * agreement.dailyRate;
          const cumulativePaid = paymentsAfterIOUs;
          const balance = cumulativeExpected - cumulativePaid;

          dailyBreakdown.push({
            date: dateStr,
            dayNumber,
            expectedAmount: agreement.dailyRate,
            cumulativeExpected,
            cumulativePaid: Math.min(cumulativePaid, cumulativeExpected),
            balance: Math.max(0, balance),
            isPaid: cumulativePaid >= cumulativeExpected,
          });
        }

        return {
          agreement,
          daysElapsed,
          expectedTotal,
          totalPaid: paymentsAfterIOUs, // Only show what counts toward agreement
          runningBalance,
          daysAhead,
          currentMonthExpected,
          currentMonthPaid,
          currentMonthBalance,
          iouDebt: iouRemainingDebt,
          dailyBreakdown,
        };
      })
    );

    return NextResponse.json({ agreements: formattedAgreements, statuses });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { personName, dailyRate, startDate, notes, isActive } = body;

    if (!personName || dailyRate === undefined || !startDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sanitizedPersonName = sanitizeString(personName);
    if (!sanitizedPersonName) {
      return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
    }

    const parsedDailyRate = parseFloatSafe(dailyRate, 0);
    if (parsedDailyRate === null) {
      return NextResponse.json({ error: "Invalid daily rate" }, { status: 400 });
    }

    const dateObj = parseDateOnlyAsUTC(startDate);

    const agreement = await DailyRateAgreement.create({
      userId: session.user.id,
      personName: sanitizedPersonName,
      dailyRate: parsedDailyRate,
      startDate: dateObj,
      notes: notes ? sanitizeString(notes) || null : null,
      isActive: isActive !== undefined ? isActive : true,
    });

    const agreementObj = agreement.toObject();
    const formattedAgreement = {
      ...agreementObj,
      _id: agreementObj._id.toString(),
      startDate: formatDateAsUTC(new Date(agreementObj.startDate)),
      createdAt: agreementObj.createdAt.toISOString(),
      updatedAt: agreementObj.updatedAt.toISOString(),
    };

    return NextResponse.json(formattedAgreement, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
