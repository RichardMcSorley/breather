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
    const { transactionId, ocrExportId, deliveryOrderId, action, force } = body;

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
        // Validate filters: appName match (unless forced)
        if (!force) {
          const customerAppName = (ocrExport.appName || "").trim().toLowerCase();
          const orderAppName = (deliveryOrder.appName || "").trim().toLowerCase();
          if (customerAppName && orderAppName && customerAppName !== orderAppName) {
            return NextResponse.json({ 
              error: "Cannot link: customer appName does not match order appName" 
            }, { status: 400 });
          }
        }

        // Add order to customer's linked orders
        if (!ocrExport.linkedDeliveryOrderIds || !ocrExport.linkedDeliveryOrderIds.includes(deliveryOrder._id)) {
          await OcrExport.findByIdAndUpdate(
            ocrExportId,
            { $addToSet: { linkedDeliveryOrderIds: deliveryOrder._id } },
            { new: true }
          );
        }

        // Add customer to order's linked customers
        if (!deliveryOrder.linkedOcrExportIds || !deliveryOrder.linkedOcrExportIds.includes(ocrExport._id)) {
          await DeliveryOrder.findByIdAndUpdate(
            deliveryOrderId,
            { $addToSet: { linkedOcrExportIds: ocrExport._id } },
            { new: true }
          );
        }
      } else {
        // Unlink
        await OcrExport.findByIdAndUpdate(
          ocrExportId,
          { $pull: { linkedDeliveryOrderIds: deliveryOrder._id } },
          { new: true }
        );
        await DeliveryOrder.findByIdAndUpdate(
          deliveryOrderId,
          { $pull: { linkedOcrExportIds: ocrExport._id } },
          { new: true }
        );
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

        // Validate filters: appName (unless forced)
        if (!force && transaction.tag) {
          const transactionTag = (transaction.tag || "").trim().toLowerCase();
          const customerAppName = (ocrExport.appName || "").trim().toLowerCase();
          if (transactionTag && customerAppName && transactionTag !== customerAppName) {
            return NextResponse.json({ 
              error: "Cannot link: transaction source/appName does not match customer appName" 
            }, { status: 400 });
          }
        }

        // Update transaction - add to array
        await Transaction.findByIdAndUpdate(
          transactionId,
          { $addToSet: { linkedOcrExportIds: ocrExport._id } },
          { new: true }
        );

        // Update OcrExport
        await OcrExport.findByIdAndUpdate(
          ocrExportId,
          { $addToSet: { linkedTransactionIds: transaction._id } },
          { new: true }
        );
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

        // Validate filters: appName (unless forced)
        if (!force && transaction.tag) {
          const transactionTag = (transaction.tag || "").trim().toLowerCase();
          const orderAppName = (deliveryOrder.appName || "").trim().toLowerCase();
          if (transactionTag && orderAppName && transactionTag !== orderAppName) {
            return NextResponse.json({ 
              error: "Cannot link: transaction source/appName does not match order appName" 
            }, { status: 400 });
          }
        }

        // Update transaction - add to array (do not set active to true)
        await Transaction.findByIdAndUpdate(
          transactionId,
          {
            $addToSet: { linkedDeliveryOrderIds: deliveryOrder._id },
          },
          { new: true }
        );

        // Update DeliveryOrder
        await DeliveryOrder.findByIdAndUpdate(
          deliveryOrderId,
          { $addToSet: { linkedTransactionIds: transaction._id } },
          { new: true }
        );
      }
    } else if (action === "unlink") {
      // Unlink from OcrExport
      if (ocrExportId) {
        if (!isValidObjectId(ocrExportId)) {
          return NextResponse.json({ error: "Invalid OcrExport ID" }, { status: 400 });
        }

        await OcrExport.findByIdAndUpdate(
          ocrExportId,
          { $pull: { linkedTransactionIds: transaction._id } },
          { new: true }
        );

        await Transaction.findByIdAndUpdate(
          transactionId,
          { $pull: { linkedOcrExportIds: ocrExportId } },
          { new: true }
        );
      }

      // Unlink from DeliveryOrder
      if (deliveryOrderId) {
        if (!isValidObjectId(deliveryOrderId)) {
          return NextResponse.json({ error: "Invalid DeliveryOrder ID" }, { status: 400 });
        }

        await DeliveryOrder.findByIdAndUpdate(
          deliveryOrderId,
          { $pull: { linkedTransactionIds: transaction._id } },
          { new: true }
        );

        // Unlink the order and check if there are any remaining linked orders
        const updatedTransaction = await Transaction.findByIdAndUpdate(
          transactionId,
          { $pull: { linkedDeliveryOrderIds: deliveryOrderId } },
          { new: true }
        );

        // If no more linked delivery orders, set active to false
        if (updatedTransaction && (!updatedTransaction.linkedDeliveryOrderIds || updatedTransaction.linkedDeliveryOrderIds.length === 0)) {
          await Transaction.findByIdAndUpdate(
            transactionId,
            { $set: { active: false } },
            { new: true }
          );
        }
      }
    }

    return NextResponse.json({ success: true, message: `Transaction ${action}ed successfully` });
  } catch (error) {
    return handleApiError(error);
  }
}

