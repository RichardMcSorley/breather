import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Transaction from "@/lib/models/Transaction";
import OcrExport from "@/lib/models/OcrExport";
import DeliveryOrder from "@/lib/models/DeliveryOrder";
import { handleApiError } from "@/lib/api-error-handler";
import { isValidObjectId } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { transactionId, ocrExportId, deliveryOrderId, action } = body;

    if (action !== "link" && action !== "unlink") {
      return NextResponse.json({ error: "Invalid action. Must be 'link' or 'unlink'" }, { status: 400 });
    }

    // Handle linking order to customer (without transaction)
    if (ocrExportId && deliveryOrderId && !transactionId) {
      if (!isValidObjectId(ocrExportId) || !isValidObjectId(deliveryOrderId)) {
        return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
      }

      const ocrExport = await OcrExport.findById(ocrExportId);
      const deliveryOrder = await DeliveryOrder.findById(deliveryOrderId);

      if (!ocrExport || !deliveryOrder) {
        return NextResponse.json({ error: "Customer or order not found" }, { status: 404 });
      }
      if (ocrExport.userId !== session.user.id || deliveryOrder.userId !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      if (action === "link") {
        // Add order to customer's linked orders (we'll store in a new field or use existing pattern)
        // For now, we'll link via transactions, but we need a way to link orders to customers directly
        // Let's add linkedDeliveryOrderIds to OcrExport model
        if (!ocrExport.linkedDeliveryOrderIds) {
          ocrExport.linkedDeliveryOrderIds = [];
        }
        if (!ocrExport.linkedDeliveryOrderIds.includes(deliveryOrder._id)) {
          ocrExport.linkedDeliveryOrderIds.push(deliveryOrder._id);
          await ocrExport.save();
        }

        // Add customer to order's linked customers
        if (!deliveryOrder.linkedOcrExportIds) {
          deliveryOrder.linkedOcrExportIds = [];
        }
        if (!deliveryOrder.linkedOcrExportIds.includes(ocrExport._id)) {
          deliveryOrder.linkedOcrExportIds.push(ocrExport._id);
          await deliveryOrder.save();
        }
      } else {
        // Unlink
        if (ocrExport.linkedDeliveryOrderIds) {
          ocrExport.linkedDeliveryOrderIds = ocrExport.linkedDeliveryOrderIds.filter(
            (id) => id.toString() !== deliveryOrderId
          );
          await ocrExport.save();
        }
        if (deliveryOrder.linkedOcrExportIds) {
          deliveryOrder.linkedOcrExportIds = deliveryOrder.linkedOcrExportIds.filter(
            (id) => id.toString() !== ocrExportId
          );
          await deliveryOrder.save();
        }
      }

      return NextResponse.json({ success: true, message: `Order ${action}ed successfully` });
    }

    // Original transaction linking logic
    if (!transactionId || !isValidObjectId(transactionId)) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    // Verify transaction exists and belongs to user
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (transaction.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow linking income transactions
    if (transaction.type !== "income") {
      return NextResponse.json({ error: "Only income transactions can be linked" }, { status: 400 });
    }

    if (action === "link") {
      // Link to OcrExport (customer)
      if (ocrExportId) {
        if (!isValidObjectId(ocrExportId)) {
          return NextResponse.json({ error: "Invalid OcrExport ID" }, { status: 400 });
        }

        const ocrExport = await OcrExport.findById(ocrExportId);
        if (!ocrExport) {
          return NextResponse.json({ error: "Customer not found" }, { status: 404 });
        }
        if (ocrExport.userId !== session.user.id) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update transaction
        transaction.linkedOcrExportId = ocrExport._id;
        await transaction.save();

        // Update OcrExport
        if (!ocrExport.linkedTransactionIds) {
          ocrExport.linkedTransactionIds = [];
        }
        if (!ocrExport.linkedTransactionIds.includes(transaction._id)) {
          ocrExport.linkedTransactionIds.push(transaction._id);
          await ocrExport.save();
        }
      }

      // Link to DeliveryOrder
      if (deliveryOrderId) {
        if (!isValidObjectId(deliveryOrderId)) {
          return NextResponse.json({ error: "Invalid DeliveryOrder ID" }, { status: 400 });
        }

        const deliveryOrder = await DeliveryOrder.findById(deliveryOrderId);
        if (!deliveryOrder) {
          return NextResponse.json({ error: "Delivery order not found" }, { status: 404 });
        }
        if (deliveryOrder.userId !== session.user.id) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update transaction
        transaction.linkedDeliveryOrderId = deliveryOrder._id;
        await transaction.save();

        // Update DeliveryOrder
        if (!deliveryOrder.linkedTransactionIds) {
          deliveryOrder.linkedTransactionIds = [];
        }
        if (!deliveryOrder.linkedTransactionIds.includes(transaction._id)) {
          deliveryOrder.linkedTransactionIds.push(transaction._id);
          await deliveryOrder.save();
        }
      }
    } else if (action === "unlink") {
      // Unlink from OcrExport
      if (ocrExportId) {
        if (!isValidObjectId(ocrExportId)) {
          return NextResponse.json({ error: "Invalid OcrExport ID" }, { status: 400 });
        }

        const ocrExport = await OcrExport.findById(ocrExportId);
        if (ocrExport && ocrExport.linkedTransactionIds) {
          ocrExport.linkedTransactionIds = ocrExport.linkedTransactionIds.filter(
            (id) => id.toString() !== transactionId
          );
          await ocrExport.save();
        }

        if (transaction.linkedOcrExportId?.toString() === ocrExportId) {
          transaction.linkedOcrExportId = undefined;
          await transaction.save();
        }
      }

      // Unlink from DeliveryOrder
      if (deliveryOrderId) {
        if (!isValidObjectId(deliveryOrderId)) {
          return NextResponse.json({ error: "Invalid DeliveryOrder ID" }, { status: 400 });
        }

        const deliveryOrder = await DeliveryOrder.findById(deliveryOrderId);
        if (deliveryOrder && deliveryOrder.linkedTransactionIds) {
          deliveryOrder.linkedTransactionIds = deliveryOrder.linkedTransactionIds.filter(
            (id) => id.toString() !== transactionId
          );
          await deliveryOrder.save();
        }

        if (transaction.linkedDeliveryOrderId?.toString() === deliveryOrderId) {
          transaction.linkedDeliveryOrderId = undefined;
          await transaction.save();
        }
      }
    }

    return NextResponse.json({ success: true, message: `Transaction ${action}ed successfully` });
  } catch (error) {
    return handleApiError(error);
  }
}

