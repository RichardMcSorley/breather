import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load env
dotenv.config({ path: "/Users/nat/projects/breather/.env.local" });

const ENCRYPTION_KEY = process.env.TESLA_ENCRYPTION_KEY;
const TESLA_API_BASE_URL = process.env.TESLA_API_BASE_URL;
const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET;

function getKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function decryptToken(encryptedToken) {
  const key = getKey();
  const parts = encryptedToken.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

async function main() {
  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Find Tesla connection
  const collection = mongoose.connection.db.collection("teslaconnections");
  const conn = await collection.findOne({});
  
  if (!conn) {
    console.log("No Tesla connection found in DB");
    process.exit(1);
  }

  console.log(`Found connection for vehicle: ${conn.vehicleName} (tag: ${conn.vehicleTag})`);
  console.log(`Last synced: ${conn.lastSyncedAt}`);

  // Decrypt tokens
  let accessToken = decryptToken(conn.encryptedAccessToken);
  const refreshToken = decryptToken(conn.encryptedRefreshToken);
  console.log("Tokens decrypted successfully");

  // Try refreshing the token first (it's probably expired)
  console.log("Refreshing access token...");
  const refreshResp = await fetch("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      refresh_token: refreshToken,
      audience: TESLA_API_BASE_URL,
    }),
  });

  if (!refreshResp.ok) {
    const err = await refreshResp.text();
    console.log("Token refresh failed:", err);
    console.log("May need to re-authorize with vehicle_cmds scope");
    process.exit(1);
  }

  const tokenData = await refreshResp.json();
  accessToken = tokenData.access_token;
  console.log("Token refreshed! Expires in:", tokenData.expires_in, "seconds");

  // Check current scopes
  // Try to get vehicle data first
  console.log("\nGetting vehicle data...");
  const vehicleResp = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${conn.vehicleTag}/vehicle_data`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (vehicleResp.status === 408) {
    console.log("Vehicle is asleep. Waking up...");
    await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${conn.vehicleTag}/wake_up`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("Wake command sent. Waiting 15 seconds...");
    await new Promise(r => setTimeout(r, 15000));
  } else if (vehicleResp.ok) {
    const vData = await vehicleResp.json();
    const climate = vData.response?.climate_state;
    if (climate) {
      console.log(`Inside temp: ${climate.inside_temp}°C / ${(climate.inside_temp * 9/5 + 32).toFixed(1)}°F`);
      console.log(`Outside temp: ${climate.outside_temp}°C / ${(climate.outside_temp * 9/5 + 32).toFixed(1)}°F`);
      console.log(`HVAC on: ${climate.is_climate_on}`);
    }
  }

  // Try climate command
  console.log("\nSending auto_conditioning_start command...");
  const climateResp = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${conn.vehicleTag}/command/auto_conditioning_start`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const climateResult = await climateResp.json();
  console.log("Climate response:", JSON.stringify(climateResult, null, 2));

  if (climateResp.ok && climateResult.response?.result) {
    console.log("\n🔥 HEATER IS ON! Your car is warming up.");
  } else {
    console.log("\n❌ Command failed. May need vehicle_cmds scope.");
    console.log("Status:", climateResp.status);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
