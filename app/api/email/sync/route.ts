import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import EmailConfig from "@/lib/models/EmailConfig";
import Transaction from "@/lib/models/Transaction";
import {
  createImapConnection,
  connectToImap,
  openInbox,
  searchCashAppEmails,
  fetchEmails,
  closeImap,
  EmailConfig as EmailConfigType,
  getEmailConfigFromEnv,
} from "@/lib/email-helper";
import { parseCashAppEmails } from "@/lib/cash-app-email-parser";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let imap: any = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Try to get email config from environment variables first
    let config: EmailConfigType | null = getEmailConfigFromEnv();

    // If not in env vars, try database config
    if (!config) {
      const emailConfig = await EmailConfig.findOne({ userId: session.user.id });
      if (!emailConfig || !emailConfig.isActive) {
        return NextResponse.json(
          {
            error:
              "Email configuration not found. Set EMAIL_USERNAME, EMAIL_TOKEN, EMAIL_SERVER, and EMAIL_PORT environment variables, or configure via API.",
            message: "Email configuration not found",
          },
          { status: 400 }
        );
      }

      config = {
        imapHost: emailConfig.imapHost,
        imapPort: emailConfig.imapPort,
        username: emailConfig.username,
        password: emailConfig.encryptedPassword,
        tls: emailConfig.imapPort === 993 || emailConfig.imapPort === 143,
        isEncrypted: true,
      };
    }

    // Get or create email config for tracking sync status
    let emailConfig = await EmailConfig.findOne({ userId: session.user.id });
    if (!emailConfig) {
      // When using env vars, we still need to store encryptedPassword for the schema
      // Use a placeholder since the actual password is in env vars
      const { encryptEmailPassword } = await import("@/lib/email-encryption");
      emailConfig = await EmailConfig.create({
        userId: session.user.id,
        email: config.username,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        username: config.username,
        encryptedPassword: encryptEmailPassword("env-var-placeholder"), // Placeholder since using env vars
        isActive: true,
      });
    }

    imap = createImapConnection(config);

    // Connect to IMAP server
    await connectToImap(imap);

    // Open inbox
    await openInbox(imap);

    // Get last sync date to only fetch new emails
    // If lastSyncAt is in the future (likely a bug), default to 30 days ago
    let sinceDate: Date | undefined;
    if (emailConfig.lastSyncAt) {
      const lastSync = new Date(emailConfig.lastSyncAt);
      const now = new Date();
      // Only use lastSyncAt if it's in the past (not a future date bug)
      if (lastSync < now) {
        sinceDate = lastSync;
      } else {
        sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // First sync - search last 30 days
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Search for Cash App emails
    const emailUids = await searchCashAppEmails(imap, sinceDate, false);

    // Limit the number of emails to process (default: 50, configurable via env var)
    const maxEmails = parseInt(process.env.EMAIL_SYNC_LIMIT || "50", 10);
    const limitedUids = emailUids.slice(-maxEmails); // Take the most recent N emails

    if (limitedUids.length === 0) {
      // Update last sync time even if no emails found
      emailConfig.lastSyncAt = new Date();
      emailConfig.lastSyncStatus = "success";
      emailConfig.lastSyncError = undefined;
      await emailConfig.save();

      await closeImap(imap);
      return NextResponse.json({
        message: "No new Cash App emails found",
        emailsProcessed: 0,
        transactionsCreated: 0,
      });
    }

    // Fetch email content (only for limited set)
    const emails = await fetchEmails(imap, limitedUids);

    // Close IMAP connection
    await closeImap(imap);
    imap = null;

    // Parse emails into transactions
    const parsedTransactions = parseCashAppEmails(emails);

    // Create transactions with deduplication
    let transactionsCreated = 0;
    let transactionsSkipped = 0;
    const errors: string[] = [];

    for (const parsedTx of parsedTransactions) {
      try {
        // Check for duplicate transaction
        // Look for transactions with same amount, date, and similar notes within 1 hour
        const oneHourBefore = new Date(parsedTx.date.getTime() - 60 * 60 * 1000);
        const oneHourAfter = new Date(parsedTx.date.getTime() + 60 * 60 * 1000);

        const existingTransaction = await Transaction.findOne({
          userId: session.user.id,
          amount: parsedTx.amount,
          type: parsedTx.type,
          date: {
            $gte: oneHourBefore,
            $lte: oneHourAfter,
          },
          // Check if notes are similar (case-insensitive partial match)
          notes: { $regex: new RegExp(parsedTx.notes?.substring(0, 20) || "", "i") },
        });

        if (existingTransaction) {
          transactionsSkipped++;
          continue;
        }

        // If transaction ID exists, also check for that
        if (parsedTx.transactionId) {
          const existingByTransactionId = await Transaction.findOne({
            userId: session.user.id,
            notes: { $regex: new RegExp(parsedTx.transactionId, "i") },
          });

          if (existingByTransactionId) {
            transactionsSkipped++;
            continue;
          }
        }

        // Create new transaction
        const transaction = await Transaction.create({
          userId: session.user.id,
          amount: parsedTx.amount,
          type: parsedTx.type,
          date: parsedTx.date,
          time: parsedTx.time,
          notes: parsedTx.notes,
          tag: "Cash App",
          isBill: false,
          step: "CREATED",
          active: false,
        });

        transactionsCreated++;
      } catch (error: any) {
        errors.push(`Failed to create transaction from email UID ${parsedTx.emailUid}: ${error.message}`);
      }
    }

    // Update email config with sync results
    emailConfig.lastSyncAt = new Date();
    emailConfig.lastSyncStatus = errors.length > 0 ? "error" : "success";
    emailConfig.lastSyncError =
      errors.length > 0 ? errors.slice(0, 3).join("; ") : undefined;
    await emailConfig.save();

    return NextResponse.json({
      message: "Email sync completed",
      emailsProcessed: emails.length,
      totalEmailsFound: emailUids.length,
      transactionsCreated,
      transactionsSkipped,
      errors: errors.length > 0 ? errors : undefined,
      limited: emailUids.length > maxEmails,
    });
  } catch (error: any) {
    // Close IMAP connection if still open
    if (imap) {
      try {
        await closeImap(imap);
      } catch (closeError) {
        // Ignore close errors
      }
    }

    // Update email config with error
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        await connectDB();
        const emailConfig = await EmailConfig.findOne({ userId: session.user.id });
        if (emailConfig) {
          emailConfig.lastSyncAt = new Date();
          emailConfig.lastSyncStatus = "error";
          emailConfig.lastSyncError = error.message || "Unknown error";
          await emailConfig.save();
        }
      }
    } catch (updateError) {
      // Ignore update errors
    }

    return handleApiError(error);
  }
}
