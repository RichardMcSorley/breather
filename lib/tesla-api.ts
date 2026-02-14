import crypto from "crypto";

const TESLA_CLIENT_ID = process.env.TESLA_CLIENT_ID;
const TESLA_CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET;
const TESLA_REDIRECT_URI = process.env.TESLA_REDIRECT_URI;
// Tesla Fleet API base URLs by region:
// North America, Asia-Pacific (excluding China): https://fleet-api.prd.na.vn.cloud.tesla.com
// Europe, Middle East, Africa: https://fleet-api.prd.eu.vn.cloud.tesla.com
const TESLA_API_BASE_URL = process.env.TESLA_API_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com";

if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET || !TESLA_REDIRECT_URI) {
  console.warn("Tesla API credentials not configured. Tesla integration will not work.");
}

export interface TeslaVehicle {
  id: number;
  vehicle_id: number;
  vin: string;
  display_name: string;
  option_codes: string;
  color: string | null;
  tokens: string[];
  state: string;
  in_service: boolean;
  id_s: string;
  calendar_enabled: boolean;
  api_version: number;
  backseat_token: string | null;
  backseat_token_updated_at: number | null;
  vehicle_tag?: string;
}

export interface TeslaVehicleData {
  response: {
    id: number;
    user_id: number;
    vehicle_id: number;
    vin: string;
    display_name: string;
    option_codes: string;
    color: string | null;
    tokens: string[];
    state: string;
    in_service: boolean;
    id_s: string;
    calendar_enabled: boolean;
    api_version: number;
    backseat_token: string | null;
    backseat_token_updated_at: number | null;
    charge_state?: {
      battery_level: number;
      charge_limit_soc: number;
      charging_state: string;
      time_to_full_charge: number;
      est_battery_range: number;
      rated_battery_range: number;
      charge_energy_added: number;
      odometer?: number;
    };
    climate_state?: {
      inside_temp: number | null;
      outside_temp: number | null;
    };
    drive_state?: {
      latitude: number;
      longitude: number;
      heading: number;
      speed: number | null;
    };
    vehicle_state?: {
      odometer: number;
      car_version: string;
      locked: boolean;
      sentry_mode: boolean;
    };
    vehicle_config?: {
      car_type: string;
      car_special_type: string;
      trim_badging: string;
      exterior_color: string;
    };
  };
}

export interface TeslaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  created_at: number;
}

export interface TeslaError {
  error: string;
  error_description?: string;
}

export interface TeslaPartnerTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get partner authentication token (required for registration)
 * This uses client_credentials grant type
 */
export async function getPartnerToken(): Promise<TeslaPartnerTokenResponse> {
  if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET) {
    throw new Error("Tesla API credentials not configured");
  }

  const response = await fetch("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      audience: TESLA_API_BASE_URL,
      scope: "openid vehicle_device_data",
    }),
  });

  if (!response.ok) {
    const error: TeslaError = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error_description || error.error || "Failed to get partner token");
  }

  return response.json();
}

/**
 * Register application in the current region
 * Requires:
 * - Partner authentication token
 * - Public key hosted at https://your-domain/.well-known/appspecific/com.tesla.3p.public-key.pem
 * - Domain must match allowed_origins from developer.tesla.com
 */
export async function registerApplication(partnerToken: string, domain: string): Promise<void> {
  const response = await fetch(`${TESLA_API_BASE_URL}/api/1/partner_accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${partnerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain: domain,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || error.message || "Failed to register application");
  }
}

/**
 * Generate the OAuth authorization URL
 */
export function getTeslaAuthUrl(state?: string): string {
  if (!TESLA_CLIENT_ID || !TESLA_REDIRECT_URI) {
    throw new Error("Tesla API credentials not configured");
  }

  const params = new URLSearchParams({
    client_id: TESLA_CLIENT_ID,
    redirect_uri: TESLA_REDIRECT_URI,
    response_type: "code",
    scope: "openid offline_access vehicle_device_data vehicle_cmds",
    state: state || crypto.randomBytes(16).toString("hex"),
  });

  return `https://auth.tesla.com/oauth2/v3/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForTokens(code: string): Promise<TeslaTokenResponse> {
  if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET || !TESLA_REDIRECT_URI) {
    throw new Error("Tesla API credentials not configured");
  }

  // Use fleet-auth domain for token exchange (required by Tesla)
  const response = await fetch("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      code,
      redirect_uri: TESLA_REDIRECT_URI,
      audience: TESLA_API_BASE_URL, // Required: specifies the region/audience for the token
    }),
  });

  if (!response.ok) {
    const error: TeslaError = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error_description || error.error || "Failed to exchange code for tokens");
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TeslaTokenResponse> {
  if (!TESLA_CLIENT_ID || !TESLA_CLIENT_SECRET) {
    throw new Error("Tesla API credentials not configured");
  }

  // Use fleet-auth domain for token refresh (required by Tesla)
  const response = await fetch("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      refresh_token: refreshToken,
      audience: TESLA_API_BASE_URL, // Required: specifies the region/audience for the token
    }),
  });

  if (!response.ok) {
    const error: TeslaError = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error_description || error.error || "Failed to refresh access token");
  }

  return response.json();
}

/**
 * Get list of user's vehicles
 */
export async function getVehicles(accessToken: string): Promise<TeslaVehicle[]> {
  const response = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid or expired access token");
    }
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to fetch vehicles");
  }

  const data = await response.json();
  return data.response || [];
}

/**
 * Wake up vehicle from sleep
 */
export async function wakeVehicle(vehicleTag: string, accessToken: string): Promise<void> {
  const response = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${vehicleTag}/wake_up`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to wake vehicle");
  }

  // Wait for vehicle to wake up (polling)
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const vehicleData = await getVehicleData(vehicleTag, accessToken, false);
    if (vehicleData.response.state === "online") {
      return;
    }

    attempts++;
  }

  throw new Error("Vehicle did not wake up in time");
}

/**
 * Get vehicle data including odometer
 */
export async function getVehicleData(
  vehicleTag: string,
  accessToken: string,
  wakeIfAsleep: boolean = true
): Promise<TeslaVehicleData> {
  let response = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${vehicleTag}/vehicle_data`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  // If vehicle is asleep and we should wake it, do so
  if (response.status === 408 && wakeIfAsleep) {
    await wakeVehicle(vehicleTag, accessToken);
    // Retry after waking
    response = await fetch(`${TESLA_API_BASE_URL}/api/1/vehicles/${vehicleTag}/vehicle_data`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid or expired access token");
    }
    if (response.status === 408) {
      throw new Error("Vehicle is asleep and could not be woken");
    }
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to fetch vehicle data");
  }

  return response.json();
}

/**
 * Send a command to the vehicle
 */
async function sendVehicleCommand(
  vehicleTag: string,
  accessToken: string,
  command: string,
  body: Record<string, unknown> = {}
): Promise<{ result: boolean; reason?: string }> {
  const response = await fetch(
    `${TESLA_API_BASE_URL}/api/1/vehicles/${vehicleTag}/command/${command}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid or expired access token");
    }
    if (response.status === 408) {
      throw new Error("Vehicle is asleep — wake it first");
    }
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || error.reason || `Command ${command} failed`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Start climate control (HVAC)
 */
export async function startClimate(vehicleTag: string, accessToken: string) {
  return sendVehicleCommand(vehicleTag, accessToken, "auto_conditioning_start");
}

/**
 * Stop climate control (HVAC)
 */
export async function stopClimate(vehicleTag: string, accessToken: string) {
  return sendVehicleCommand(vehicleTag, accessToken, "auto_conditioning_stop");
}

/**
 * Set driver and passenger temperature (in Celsius)
 */
export async function setTemps(
  vehicleTag: string,
  accessToken: string,
  driverTemp: number,
  passengerTemp?: number
) {
  return sendVehicleCommand(vehicleTag, accessToken, "set_temps", {
    driver_temp: driverTemp,
    passenger_temp: passengerTemp ?? driverTemp,
  });
}

/**
 * Set seat heater level (0=off, 1=low, 2=med, 3=high)
 * Seat: 0=driver, 1=passenger, 2=rear-left, 4=rear-center, 5=rear-right
 */
export async function setSeatHeater(
  vehicleTag: string,
  accessToken: string,
  seat: number,
  level: number
) {
  return sendVehicleCommand(vehicleTag, accessToken, "remote_seat_heater_request", {
    heater: seat,
    level,
  });
}

/**
 * Get odometer reading from vehicle data
 */
export function getOdometerFromVehicleData(vehicleData: TeslaVehicleData): number | null {
  // Try vehicle_state.odometer first (most reliable)
  if (vehicleData.response.vehicle_state?.odometer !== undefined) {
    return vehicleData.response.vehicle_state.odometer;
  }

  // Fallback to charge_state.odometer if available
  if (vehicleData.response.charge_state?.odometer !== undefined) {
    return vehicleData.response.charge_state.odometer;
  }

  return null;
}

