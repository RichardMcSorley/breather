import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import { handleApiError } from "@/lib/api-error-handler";
import { getPartnerToken, registerApplication } from "@/lib/tesla-api";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Allow registration without auth for localhost development
    // In production, you may want to add authentication
    const isLocalhost = request.headers.get("host")?.includes("localhost");
    
    if (!isLocalhost) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const { domain } = body;

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    // Get partner token
    const partnerTokenResponse = await getPartnerToken();

    // Register application
    await registerApplication(partnerTokenResponse.access_token, domain);

    return NextResponse.json({ 
      success: true, 
      message: `Application registered successfully for domain: ${domain}` 
    });
  } catch (error) {
    return handleApiError(error);
  }
}

