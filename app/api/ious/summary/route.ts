import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import IOU from "@/lib/models/IOU";
import IOUPayment from "@/lib/models/IOUPayment";
import { handleApiError } from "@/lib/api-error-handler";
import { IOUSummary } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get all active IOUs grouped by person
    const iousByPerson = await IOU.aggregate([
      { $match: { userId: session.user.id, isActive: true } },
      {
        $group: {
          _id: "$personName",
          totalOwed: { $sum: "$amount" },
          iouCount: { $sum: 1 },
        },
      },
    ]);

    // Get all non-agreement payments grouped by person (agreement payments are separate)
    const paymentsByPerson = await IOUPayment.aggregate([
      { $match: { userId: session.user.id, isAgreementPayment: { $ne: true } } },
      {
        $group: {
          _id: "$personName",
          totalPaid: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
        },
      },
    ]);

    // Create a map of payments by person
    const paymentsMap = new Map<string, { totalPaid: number; paymentCount: number }>();
    for (const p of paymentsByPerson) {
      paymentsMap.set(p._id, { totalPaid: p.totalPaid, paymentCount: p.paymentCount });
    }

    // Build the summary
    const summary: IOUSummary[] = iousByPerson.map((iou) => {
      const payments = paymentsMap.get(iou._id) || { totalPaid: 0, paymentCount: 0 };
      return {
        personName: iou._id,
        totalOwed: iou.totalOwed,
        totalPaid: payments.totalPaid,
        balance: iou.totalOwed - payments.totalPaid,
        iouCount: iou.iouCount,
        paymentCount: payments.paymentCount,
      };
    });

    // Sort by balance (highest first)
    summary.sort((a, b) => b.balance - a.balance);

    return NextResponse.json({ summary });
  } catch (error) {
    return handleApiError(error);
  }
}
