import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Bill from "@/lib/models/Bill";
import { BillQuery } from "@/lib/types";
import { getBillPayments, getPaymentPlan } from "@/lib/dashboard-data";

/**
 * Server-side data fetching functions for bills page
 * Reuses getBillPayments and getPaymentPlan from dashboard-data.ts
 */

export async function getBills(isActive?: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const query: BillQuery = { userId: session.user.id };
  if (isActive !== undefined) {
    query.isActive = isActive;
  }

  const bills = await Bill.find(query).sort({ dueDate: 1, name: 1 }).lean();

  return { bills };
}

// Re-export functions from dashboard-data.ts
export { getBillPayments, getPaymentPlan };
