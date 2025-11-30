import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/config";
import { handleApiError } from "@/lib/api-error-handler";
import { getPartnerToken, registerApplication } from "@/lib/tesla-api";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Allow registration without auth for one-time setup
    // This is a one-time operation to register the application with Tesla
    // In production, you may want to add authentication after initial registration
    const isLocalhost = request.headers.get("host")?.includes("localhost");
    
    // For production, allow registration without auth for one-time setup
    // TODO: Consider adding API key or session auth after initial registration
    if (!isLocalhost) {
      // Optionally check for API key if set
      const apiKey = request.headers.get("x-api-key");
      const expectedApiKey = process.env.TESLA_REGISTRATION_API_KEY;
      
      // If API key is configured, require it; otherwise allow without auth for setup
      if (expectedApiKey) {
        if (apiKey !== expectedApiKey) {
          return NextResponse.json({ 
            error: "Unauthorized. Provide x-api-key header." 
          }, { status: 401 });
        }
      }
      // If no API key is configured, allow registration (for one-time setup)
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

