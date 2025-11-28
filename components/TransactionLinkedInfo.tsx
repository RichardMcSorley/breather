"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";

interface TransactionLinkedInfoProps {
  transactionId?: string;
  transactionData: any;
  transactionType: "income" | "expense";
  onClose: () => void;
  onShowLinkCustomerModal: () => void;
  onShowLinkOrderModal: () => void;
  onEditCustomer?: (address: string, entryId?: string) => void;
  onEditOrder?: (orderId: string) => void;
}

export default function TransactionLinkedInfo({
  transactionId,
  transactionData,
  transactionType,
  onClose,
  onShowLinkCustomerModal,
  onShowLinkOrderModal,
  onEditCustomer,
  onEditOrder,
}: TransactionLinkedInfoProps) {
  const queryClient = useQueryClient();

  if (!transactionId || !transactionData || transactionType !== "income") {
    return null;
  }

  return (
    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Linked Information
      </div>
      {transactionData.linkedOcrExports && transactionData.linkedOcrExports.length > 0 && (
        <div className="mb-3 space-y-2">
          {transactionData.linkedOcrExports.map((customer: any) => (
            <div key={customer.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Linked Customer</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    👤 {customer.customerName}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {customer.customerAddress}
                  </div>
                  {customer.appName && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      App: {customer.appName}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onEditCustomer) {
                        onEditCustomer(customer.customerAddress, customer.entryId);
                      }
                    }}
                    className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!transactionId || !customer) return;
                      try {
                        const response = await fetch("/api/link", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            transactionId,
                            ocrExportId: customer.id,
                            action: "unlink",
                          }),
                        });
                        if (response.ok) {
                          queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
                        }
                      } catch (error) {
                        console.error("Failed to unlink customer:", error);
                      }
                    }}
                    className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {transactionData.linkedDeliveryOrders && transactionData.linkedDeliveryOrders.length > 0 && (
        <div className="mb-3 space-y-2">
          {transactionData.linkedDeliveryOrders.map((order: any) => (
            <div key={order.id} className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Linked Delivery Order</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    📦 {order.restaurantName}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {order.appName} • {order.miles?.toFixed(1) || "0"} mi • ${order.money?.toFixed(2) || "0.00"}
                  </div>
                  {order.miles && order.money && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Ratio: ${(order.money / order.miles).toFixed(2)}/mi
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onEditOrder) {
                        onEditOrder(order.id);
                      }
                    }}
                    className="px-3 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!transactionId || !order) return;
                      try {
                        const response = await fetch("/api/link", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            transactionId,
                            deliveryOrderId: order.id,
                            action: "unlink",
                          }),
                        });
                        if (response.ok) {
                          queryClient.invalidateQueries({ queryKey: queryKeys.transaction(transactionId) });
                        }
                      } catch (error) {
                        console.error("Failed to unlink order:", error);
                      }
                    }}
                    className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {(!transactionData.linkedOcrExports || transactionData.linkedOcrExports.length === 0) && 
       (!transactionData.linkedDeliveryOrders || transactionData.linkedDeliveryOrders.length === 0) && (
        <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg mb-3">
          No linked customer or order
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onShowLinkCustomerModal}
          className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Link Customer
        </button>
        <button
          type="button"
          onClick={onShowLinkOrderModal}
          className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
        >
          Link Order
        </button>
      </div>
    </div>
  );
}

