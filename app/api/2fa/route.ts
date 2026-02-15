import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import connectDB from "@/lib/mongodb";
import TwoFactorCode from "@/lib/models/TwoFactorCode";

const AUTH_TOKEN = process.env.TFA_AUTH_TOKEN;
const TTL_MINUTES = 5;

function authenticate(req: NextRequest): boolean {
  if (!AUTH_TOKEN) return false;
  const token =
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    req.headers.get("x-auth-token");
  return token === AUTH_TOKEN;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// POST /api/2fa — receive SMS text, extract code via LLM
export async function POST(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing 'text' field" },
        { status: 400 }
      );
    }

    // Extract provider + code via Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Extract the 2FA/verification code from this SMS message. Return ONLY valid JSON with these fields:
- provider: a short lowercase slug identifying the sender (e.g. "rocket-mortgage", "doordash", "tesla", "chase")
- code: the verification code as a string
- expiresIn: estimated expiry in minutes (default 5 if not mentioned)

SMS: "${text}"`,
    });

    const raw = result.text?.trim() || "";
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    let parsed: { provider: string; code: string; expiresIn?: number };

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse LLM response", raw },
        { status: 422 }
      );
    }

    if (!parsed.provider || !parsed.code) {
      return NextResponse.json(
        { error: "LLM could not extract provider/code", raw },
        { status: 422 }
      );
    }

    const expiresIn = Math.min(parsed.expiresIn || TTL_MINUTES, 10);
    const expires_at = new Date(Date.now() + expiresIn * 60 * 1000);

    await connectDB();

    // Upsert — replace any existing code for this provider
    const doc = await TwoFactorCode.findOneAndUpdate(
      { provider: parsed.provider },
      {
        provider: parsed.provider,
        code: parsed.code,
        raw_text: text,
        expires_at,
        created_at: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      provider: parsed.provider,
      code: parsed.code,
      expires_at: doc.expires_at,
    });
  } catch (error: any) {
    console.error("2FA POST error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

// GET /api/2fa?provider=xxx — poll for pending code
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json(
      { error: "Missing 'provider' query param" },
      { status: 400 }
    );
  }

  await connectDB();

  const doc = await TwoFactorCode.findOne({
    provider,
    expires_at: { $gt: new Date() },
  });

  if (!doc) {
    return NextResponse.json({ found: false, provider });
  }

  return NextResponse.json({
    found: true,
    provider: doc.provider,
    code: doc.code,
    expires_at: doc.expires_at,
    created_at: doc.created_at,
  });
}

// DELETE /api/2fa?provider=xxx — cleanup after use
export async function DELETE(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json(
      { error: "Missing 'provider' query param" },
      { status: 400 }
    );
  }

  await connectDB();

  const result = await TwoFactorCode.deleteMany({ provider });

  return NextResponse.json({
    success: true,
    provider,
    deleted: result.deletedCount,
  });
}
