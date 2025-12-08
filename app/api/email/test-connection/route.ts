import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import EmailConfig from "@/lib/models/EmailConfig";
import {
  createImapConnection,
  connectToImap,
  closeImap,
  EmailConfig as EmailConfigType,
  getEmailConfigFromEnv,
} from "@/lib/email-helper";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

export async function POST() {
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
          },
          { status: 404 }
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

    // Try to connect
    imap = createImapConnection(config);

    try {
      await connectToImap(imap);
      await closeImap(imap);

      return NextResponse.json({
        success: true,
        message: "Successfully connected to email server",
        config: {
          host: config.imapHost,
          port: config.imapPort,
          username: config.username,
          tls: config.tls,
        },
      });
    } catch (connectionError: any) {
      await closeImap(imap).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          error: connectionError.message || "Failed to connect to email server",
          config: {
            host: config.imapHost,
            port: config.imapPort,
            username: config.username,
            tls: config.tls,
          },
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
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
