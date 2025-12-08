import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import EmailConfig from "@/lib/models/EmailConfig";
import { encryptEmailPassword } from "@/lib/email-encryption";
import { getEmailConfigFromEnv } from "@/lib/email-helper";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Check if using environment variables
    const envConfig = getEmailConfigFromEnv();
    if (envConfig) {
      // Return env config info (without password)
      return NextResponse.json({
        source: "environment",
        email: envConfig.username,
        imapHost: envConfig.imapHost,
        imapPort: envConfig.imapPort,
        username: envConfig.username,
        isActive: true,
        message: "Using environment variables (EMAIL_USERNAME, EMAIL_TOKEN, EMAIL_SERVER, EMAIL_PORT)",
      });
    }

    // Fall back to database config
    const config = await EmailConfig.findOne({ userId: session.user.id }).lean();

    if (!config) {
      // Return 200 with null status instead of 404, so UI can handle it gracefully
      return NextResponse.json({
        source: null,
        isActive: false,
        message: "Email configuration not found",
      });
    }

    // Don't return the encrypted password
    const { encryptedPassword, ...safeConfig } = config;
    return NextResponse.json({
      ...safeConfig,
      source: "database",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { email, imapHost, imapPort, username, password } = body;

    if (!email || !username || !password) {
      return NextResponse.json(
        { error: "Missing required fields: email, username, password" },
        { status: 400 }
      );
    }

    // Encrypt password before storing
    const encryptedPassword = encryptEmailPassword(password);

    // Find or create email config
    let config = await EmailConfig.findOne({ userId: session.user.id });

    if (config) {
      // Update existing config
      config.email = email;
      config.imapHost = imapHost || "127.0.0.1";
      config.imapPort = imapPort || 1143;
      config.username = username;
      config.encryptedPassword = encryptedPassword;
      config.isActive = true;
    } else {
      // Create new config
      config = await EmailConfig.create({
        userId: session.user.id,
        email,
        imapHost: imapHost || "127.0.0.1",
        imapPort: imapPort || 1143,
        username,
        encryptedPassword,
        isActive: true,
      });
    }

    await config.save();

    // Return config without password
    const result = config.toObject();
    const { encryptedPassword: _, ...safeConfig } = result;
    return NextResponse.json(safeConfig, { status: config.isNew ? 201 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const config = await EmailConfig.findOneAndDelete({ userId: session.user.id });

    if (!config) {
      return NextResponse.json({ error: "Email configuration not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Email configuration deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
