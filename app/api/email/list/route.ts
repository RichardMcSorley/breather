import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import EmailConfig from "@/lib/models/EmailConfig";
import {
  createImapConnection,
  connectToImap,
  openInbox,
  fetchEmails,
  closeImap,
  EmailConfig as EmailConfigType,
  getEmailConfigFromEnv,
  searchCashAppEmails,
} from "@/lib/email-helper";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let imap: any = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

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

    // Create IMAP connection
    imap = createImapConnection(config);

    // Connect to IMAP server
    await connectToImap(imap);

    // Open inbox
    await openInbox(imap);

    // Get only Cash App emails
    const allEmailUids = await searchCashAppEmails(imap, undefined, false);

    // Apply pagination
    const paginatedUids = allEmailUids.slice(offset, offset + limit);

    // Fetch email content
    const emails = await fetchEmails(imap, paginatedUids);

    // Close IMAP connection
    await closeImap(imap);
    imap = null;

    return NextResponse.json({
      emails: emails.map((email) => ({
        uid: email.uid,
        subject: email.subject,
        from: email.from,
        date: email.date.toISOString(),
        text: email.text,
        html: email.html,
      })),
      total: allEmailUids.length,
      limit,
      offset,
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

    return handleApiError(error);
  }
}
