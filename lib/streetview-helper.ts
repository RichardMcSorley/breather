/**
 * Helper function to generate Google Street View static image URLs (server-side only)
 * 
 * Google Street View Static API format:
 * https://maps.googleapis.com/maps/api/streetview?size=WIDTHxHEIGHT&location=ADDRESS&key=API_KEY
 * or
 * https://maps.googleapis.com/maps/api/streetview?size=WIDTHxHEIGHT&location=LAT,LON&key=API_KEY
 * 
 * NOTE: This function is server-side only. For client-side usage, use the /api/streetview route.
 */

/**
 * Generate a Google Street View static image URL (server-side only)
 * @param address - Customer address string
 * @param lat - Optional latitude coordinate
 * @param lon - Optional longitude coordinate
 * @param width - Image width in pixels (default: 300)
 * @param height - Image height in pixels (default: 200)
 * @param apiKey - Optional Google Maps API key (defaults to GOOGLE_MAPS_API_KEY env var)
 * @returns Street View image URL or null if no location data available
 */
export function getStreetViewUrl(
  address?: string,
  lat?: number,
  lon?: number,
  width: number = 300,
  height: number = 200,
  apiKey?: string
): string | null {
  // Get API key from environment variable (server-side only)
  const key = apiKey || process.env.GOOGLE_MAPS_API_KEY;
  
  if (!key) {
    console.warn("GOOGLE_MAPS_API_KEY is not configured");
    return null;
  }
  
  // Prefer coordinates if available (more accurate)
  let location: string | null = null;
  if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
    location = `${lat},${lon}`;
  } else if (address && address.trim()) {
    location = encodeURIComponent(address.trim());
  } else {
    return null;
  }

  return `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&location=${location}&key=${key}`;
}

