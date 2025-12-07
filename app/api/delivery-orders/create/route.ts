import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import Transaction from "@/lib/models/Transaction";
import { handleApiError } from "@/lib/api-error-handler";
import { parseESTAsUTC } from "@/lib/date-utils";
import { randomBytes } from "crypto";
import { isValidObjectId } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { userId, appName, miles, money, restaurantName, restaurantAddress, restaurantLat, restaurantLon, restaurantPlaceId, date, time, transactionId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Ensure userId matches session
    if (userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!appName) {
      return NextResponse.json({ error: "Missing appName" }, { status: 400 });
    }

    // Miles is optional - if provided, must be valid
    if (miles !== undefined && miles !== null && miles !== "") {
      if (isNaN(parseFloat(miles)) || parseFloat(miles) < 0) {
        return NextResponse.json({ error: "Invalid miles" }, { status: 400 });
      }
    }

    if (!money || isNaN(parseFloat(money)) || parseFloat(money) <= 0) {
      return NextResponse.json({ error: "Invalid money" }, { status: 400 });
    }

    if (!restaurantName || restaurantName.trim() === "") {
      return NextResponse.json({ error: "Missing restaurantName" }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    // Generate a unique entryId
    const entryId = randomBytes(16).toString("hex");

    // Calculate miles to money ratio (only if miles is provided)
    const milesNum = miles !== undefined && miles !== null && miles !== "" ? parseFloat(miles) : undefined;
    const moneyNum = parseFloat(money);
    const milesToMoneyRatio = milesNum !== undefined && milesNum > 0 ? moneyNum / milesNum : undefined;

    // Parse date and time as EST and convert to UTC for processedAt
    // If time is provided, use it; otherwise default to midnight
    const processedAtDate = parseESTAsUTC(date, time || "00:00");

    // Create delivery order
    const deliveryOrder = await DeliveryOrder.create({
      entryId,
      userId,
      appName: appName.trim(),
      ...(milesNum !== undefined && { miles: milesNum }),
      money: moneyNum,
      ...(milesToMoneyRatio !== undefined && { milesToMoneyRatio }),
      restaurantName: restaurantName.trim(),
      restaurantAddress: restaurantAddress?.trim() || undefined,
      restaurantPlaceId: restaurantPlaceId || undefined,
      restaurantLat: restaurantLat !== undefined && restaurantLat !== null ? parseFloat(restaurantLat.toString()) : undefined,
      restaurantLon: restaurantLon !== undefined && restaurantLon !== null ? parseFloat(restaurantLon.toString()) : undefined,
      time: time || "",
      processedAt: processedAtDate,
      step: "CREATED",
      active: true,
    });

    // If transactionId is provided, link the order to the transaction
    if (transactionId && isValidObjectId(transactionId)) {
      try {
        const transaction = await Transaction.findById(transactionId);
        if (transaction && transaction.userId === userId && transaction.type === "income") {
          // Update transaction - add to array and set active to true
          const updateData: any = {
            $addToSet: { linkedDeliveryOrderIds: deliveryOrder._id },
            $set: { active: true }
          };
          
          // Add steplog if transaction doesn't have one yet
          if (!transaction.stepLog || transaction.stepLog.length === 0) {
            updateData.$push = {
              stepLog: {
                fromStep: null,
                toStep: transaction.step || "CREATED",
                time: new Date(),
              }
            };
          }
          
          await Transaction.findByIdAndUpdate(transactionId, updateData, { new: true });
          
          // Update DeliveryOrder
          await DeliveryOrder.findByIdAndUpdate(
            deliveryOrder._id,
            { $addToSet: { linkedTransactionIds: transaction._id } },
            { new: true }
          );
        }
      } catch (linkError) {
        // Log error but don't fail order creation
        console.error("Error linking order to transaction:", linkError);
      }
    }

    return NextResponse.json({
      success: true,
      id: deliveryOrder._id.toString(),
      entryId: deliveryOrder.entryId,
      message: "Delivery order created successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

