"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Mail, RefreshCw, ArrowUpCircle, ArrowDownCircle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import Layout from "@/components/Layout";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useSyncEmail, useTransactions, useEmailList, useDeleteTransaction } from "@/hooks/useQueries";
import { useToast } from "@/lib/toast";

export default function CashAppEmailsPage() {
  const { data: session } = useSession();
  const syncEmail = useSyncEmail();
  const deleteTransaction = useDeleteTransaction();
  const toast = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [emailPage, setEmailPage] = useState(0);
  const [showEmails, setShowEmails] = useState(false); // Hidden by default
  const emailsPerPage = 20;

  // Get all emails from inbox
  const { data: emailsData, isLoading: emailsLoading, refetch: refetchEmails } = useEmailList(
    emailsPerPage,
    emailPage * emailsPerPage
  );

  // Get Cash App transactions (tagged as "Cash App")
  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useTransactions(
    "all",
    "Cash App",
    1,
    100,
    ""
  );

  const handleDelete = async (transactionId: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) {
      return;
    }
    deleteTransaction.mutate(transactionId, {
      onSuccess: () => {
        refetchTransactions();
      },
    });
  };

  const emails = emailsData?.emails || [];
  const totalEmails = emailsData?.total || 0;
  const cashAppTransactions = transactionsData?.transactions || [];

  // Extract note from email text (prioritize "On statement as" from transaction details)
  const extractNoteFromEmail = (emailText: string, emailHtml?: string): string | null => {
    if (!emailText && !emailHtml) return null;
    
    const contentToSearch = [emailText, emailHtml].filter((c): c is string => Boolean(c));
    
    // First priority: Extract "On statement as" from transaction details section
    const onStatementPatterns = [
      /On\s+statement\s+as[:\s]+(.+?)(?:\n|$|Transaction|Payment|Pending)/i,
      /On\s+statement\s+as[:\s]+(.+?)(?:\n|$)/i,
      /statement\s+as[:\s]+(.+?)(?:\n|$|Transaction|Payment|Pending)/i,
    ];

    for (const content of contentToSearch) {
      for (const pattern of onStatementPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          const note = match[1].trim()
            .replace(/\s*\.$/, '')
            .trim();
          if (note.length > 0 && note.length < 200) {
            return note;
          }
        }
      }
    }
    
    // Second priority: Try to extract note after "On" statement in email body
    const onPatterns = [
      /On\s+[^,]+,?\s+you\s+(?:received|sent)\s+\$[\d.]+(?:\s+from|\s+to)?\s+(.+?)(?:\n|$|\.|,)/i,
      /On\s+[^,]+,?\s+you\s+(?:received|sent)\s+\$[\d.]+\s+(?:from|to)\s+(.+?)(?:\n|$|\.|,)/i,
      /On\s+[^,]+,?\s+(?:received|sent)\s+\$[\d.]+(?:\s+from|\s+to)?\s+(.+?)(?:\n|$|\.|,)/i,
    ];

    for (const content of contentToSearch) {
      for (const pattern of onPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          const note = match[1].trim()
            .replace(/\s*using\s+Cash\s+App.*$/i, '')
            .replace(/\s*\.$/, '')
            .trim();
          if (note.length > 0 && note.length < 200) {
            return note;
          }
        }
      }
    }
    
    return null;
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncEmail.mutateAsync();
      await refetchTransactions();
      await refetchEmails();
    } catch (error) {
      // Error is handled by the mutation
    } finally {
      setIsSyncing(false);
    }
  };

  if (transactionsLoading || emailsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emails</h1>
          </div>
          <Button
            onClick={handleSync}
            disabled={isSyncing || syncEmail.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing || syncEmail.isPending ? "animate-spin" : ""}`} />
            Sync Emails
          </Button>
        </div>

        {/* Cash App Emails List */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowEmails(!showEmails)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Cash App Emails ({totalEmails})
              </h2>
              {showEmails ? (
                <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            {showEmails && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setEmailPage(Math.max(0, emailPage - 1))}
                  disabled={emailPage === 0}
                  className="text-sm"
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {emailPage + 1} of {Math.ceil(totalEmails / emailsPerPage) || 1}
                </span>
                <Button
                  onClick={() => setEmailPage(emailPage + 1)}
                  disabled={(emailPage + 1) * emailsPerPage >= totalEmails}
                  className="text-sm"
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          {showEmails && (
            <>
              {emails.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No Cash App emails found.</p>
              <p className="text-sm mt-2">Click "Sync Emails" to fetch Cash App emails from your inbox.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {emails.map((email: any) => {
                const extractedNote = extractNoteFromEmail(email.text || "", email.html || "");
                
                return (
                  <div
                    key={email.uid}
                    className="border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {email.subject || "(No Subject)"}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Cash App
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          From: {email.from}
                        </p>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                          {format(new Date(email.date), "MMM d, yyyy h:mm a")}
                        </div>
                        {extractedNote && (
                          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                              Extracted Note:
                            </p>
                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                              {extractedNote}
                            </p>
                          </div>
                        )}
                        {email.html ? (
                          <div 
                            className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: email.html }}
                          />
                        ) : email.text ? (
                          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {email.text}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </Card>

        {/* Transactions List */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Cash App Transactions ({cashAppTransactions.length})
            </h2>
          </div>

          {cashAppTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No Cash App transactions found.</p>
              <p className="text-sm mt-2">Click "Sync Emails" to fetch Cash App emails and create transactions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cashAppTransactions.map((transaction: any) => (
                <div
                  key={transaction._id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {transaction.type === "income" ? (
                        <ArrowUpCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                      ) : (
                        <ArrowDownCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {transaction.type === "income" ? "+" : "-"}${transaction.amount.toFixed(2)}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              transaction.type === "income"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            }`}
                          >
                            {transaction.type === "income" ? "Received" : "Sent"}
                          </span>
                        </div>
                        {transaction.notes && (
                          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                              Extracted Note:
                            </p>
                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                              {transaction.notes}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {format(
                              new Date(transaction.date + (transaction.time ? "T" + transaction.time + ":00" : "")),
                              "MMM d, yyyy h:mm a"
                            )}
                          </span>
                          {transaction.tag && (
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                              {transaction.tag}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(transaction._id)}
                      className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      title="Delete transaction"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
