// Kroger API Client
// Uses OAuth 2.0 Client Credentials flow (server-side only)

import {
  KrogerAccessTokenResponse,
  KrogerProductSearchResponse,
  KrogerProductDetailsResponse,
  KrogerLocationSearchResponse,
  KrogerSearchParams,
  KrogerLocation,
  KrogerProduct,
} from "./types/kroger";
import { krogerCache } from "./kroger-cache";

const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID;
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET;
// Use environment variable if set, otherwise default to production
const KROGER_API_BASE_URL =
  process.env.KROGER_API_BASE_URL || "https://api.kroger.com/v1";
const KROGER_OAUTH2_BASE_URL =
  process.env.KROGER_OAUTH2_BASE_URL || "https://api.kroger.com/v1/connect/oauth2";
// Scope can be configured via env var, defaults to product.compact
// Locations API doesn't require a scope, but we use product.compact for consistency
const KROGER_SCOPE = process.env.KROGER_SCOPE || "product.compact";

// Token cache
let cachedToken: {
  token: string;
  expiresAt: number;
} | null = null;

/**
 * Get OAuth access token using client credentials
 * Caches token until expiration
 */
async function getKrogerAccessToken(additionalScopes?: string): Promise<string> {
  if (!KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) {
    throw new Error("Kroger API credentials not configured. Please set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables.");
  }

  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const tokenUrl = `${KROGER_OAUTH2_BASE_URL}/token`;
  
  // Combine base scope with additional scopes if provided
  const scope = additionalScopes 
    ? `${KROGER_SCOPE} ${additionalScopes}`.trim()
    : KROGER_SCOPE;
  
  const authHeader = `Basic ${Buffer.from(
    `${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`
  ).toString("base64")}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: scope,
    }),
  });

  if (!response.ok) {
    // Clear cached token on authentication errors - it might be invalid
    if (response.status === 401 || response.status === 403) {
      cachedToken = null;
    }

    const errorText = await response.text();
    let errorMessage = `Failed to get Kroger access token: ${response.status}`;
    
    try {
      const errorData = JSON.parse(errorText);
      errorMessage += ` - ${errorData.error || "Unknown error"}`;
      if (errorData.error_description) {
        errorMessage += `: ${errorData.error_description}`;
      }
    } catch {
      errorMessage += ` - ${errorText}`;
    }
    
    // Add helpful hints for common errors
    if (response.status === 401 || response.status === 403) {
      errorMessage += "\n\nPossible issues:\n";
      errorMessage += "1. Check that KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are set correctly\n";
      errorMessage += "2. Verify your credentials are valid in the Kroger Developer Portal\n";
      errorMessage += "3. Ensure your app has the required scopes registered (e.g., product.compact)\n";
      errorMessage += "4. If using certification environment, make sure you're using certification credentials\n";
      errorMessage += "5. Check if your IP address is whitelisted (if required by your Kroger app)\n";
      errorMessage += "6. Verify you're using the correct API base URL (production vs certification)";
    }
    
    throw new Error(errorMessage);
  }

  const tokenData: KrogerAccessTokenResponse = await response.json();
  
  // Cache token with 5 minute buffer before expiration
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in - 300) * 1000,
  };

  return tokenData.access_token;
}

/**
 * Search for products
 * Caches results for 4 hours in MongoDB
 */
export async function searchProducts(
  params: KrogerSearchParams
): Promise<KrogerProductSearchResponse> {
  // Create cache key from search parameters
  const cacheKey = JSON.stringify({
    term: params.term,
    brand: params.brand,
    productId: params.productId,
    locationId: params.locationId,
    fulfillment: params.fulfillment,
    start: params.start || 0,
    limit: params.limit || 10,
  });

  // Check cache first (from database)
  const cached = await krogerCache.getSearch(cacheKey);
  if (cached) {
    return cached;
  }

  let accessToken = await getKrogerAccessToken();

  const searchParams = new URLSearchParams();
  if (params.term) searchParams.append("filter.term", params.term);
  if (params.brand) searchParams.append("filter.brand", params.brand);
  if (params.productId) searchParams.append("filter.productId", params.productId);
  if (params.locationId) searchParams.append("filter.locationId", params.locationId);
  if (params.fulfillment) searchParams.append("filter.fulfillment", params.fulfillment);
  if (params.start !== undefined) searchParams.append("filter.start", params.start.toString());
  if (params.limit !== undefined) searchParams.append("filter.limit", params.limit.toString());

  const url = `${KROGER_API_BASE_URL}/products?${searchParams.toString()}`;

  let response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If we get 401 or 403, clear the cached token and retry once
  if ((response.status === 401 || response.status === 403) && cachedToken) {
    cachedToken = null; // Clear cached token
    accessToken = await getKrogerAccessToken(); // Get a fresh token
    
    // Retry the request with the new token
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Kroger product search failed: ${response.status} ${errorText}`
    );
  }

  const data: KrogerProductSearchResponse = await response.json();

  // Cache the response in database
  await krogerCache.setSearch(cacheKey, data);

  return data;
}

/**
 * Get product details by ID
 * Caches results for 7 days in MongoDB
 */
export async function getProductDetails(
  productId: string,
  locationId?: string
): Promise<KrogerProductDetailsResponse> {
  // Check cache first (from database)
  const cached = await krogerCache.getProductDetails(productId, locationId);
  if (cached) {
    return cached;
  }

  let accessToken = await getKrogerAccessToken();

  const searchParams = new URLSearchParams();
  if (locationId) {
    searchParams.append("filter.locationId", locationId);
  }

  const url = `${KROGER_API_BASE_URL}/products/${productId}${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  let response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If we get 401 or 403, clear the cached token and retry once
  if ((response.status === 401 || response.status === 403) && cachedToken) {
    cachedToken = null; // Clear cached token
    accessToken = await getKrogerAccessToken(); // Get a fresh token
    
    // Retry the request with the new token
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Kroger product details failed: ${response.status} ${errorText}`
    );
  }

  const data: KrogerProductDetailsResponse = await response.json();

  // Cache the response in database
  await krogerCache.setProductDetails(productId, data, locationId);

  return data;
}

/**
 * Search for Kroger store locations
 */
export async function searchLocations(
  zipCode?: string,
  latitude?: number,
  longitude?: number,
  limit: number = 10
): Promise<KrogerLocationSearchResponse> {
  // Locations API uses ClientContext - no special scope needed
  let accessToken = await getKrogerAccessToken();

  const searchParams = new URLSearchParams();
  if (zipCode) {
    searchParams.append("filter.zipCode.near", zipCode);
  } else if (latitude !== undefined && longitude !== undefined) {
    searchParams.append("filter.lat.near", latitude.toString());
    searchParams.append("filter.lon.near", longitude.toString());
  } else {
    throw new Error("Either zipCode or latitude/longitude must be provided");
  }
  searchParams.append("filter.limit", limit.toString());

  const url = `${KROGER_API_BASE_URL}/locations?${searchParams.toString()}`;

  let response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If we get 401 or 403, clear the cached token and retry once
  if ((response.status === 401 || response.status === 403) && cachedToken) {
    cachedToken = null; // Clear cached token
    accessToken = await getKrogerAccessToken(); // Get a fresh token
    
    // Retry the request with the new token
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Kroger location search failed: ${response.status} ${errorText}`
    );
  }

  const data: KrogerLocationSearchResponse = await response.json();
  return data;
}
