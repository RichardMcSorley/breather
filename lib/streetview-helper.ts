/**
 * Helper function to generate Google Street View static image URLs
 * 
 * Google Street View Static API format:
 * https://maps.googleapis.com/maps/api/streetview?size=WIDTHxHEIGHT&location=ADDRESS&key=API_KEY
 * or
 * https://maps.googleapis.com/maps/api/streetview?size=WIDTHxHEIGHT&location=LAT,LON&key=API_KEY
 */

/**
 * Generate a Google Street View static image URL
 * @param address - Customer address string
 * @param lat - Optional latitude coordinate
 * @param lon - Optional longitude coordinate
 * @param width - Image width in pixels (default: 300)
 * @param height - Image height in pixels (default: 200)
 * @param apiKey - Optional Google Maps API key (can be set via env var GOOGLE_MAPS_API_KEY)
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
  // Get API key from environment variable if not provided
  // Use NEXT_PUBLIC_ prefix for client-side access (user needs to set this in .env.local)
  const key = apiKey || (typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined)
    : (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined));
  
  // Prefer coordinates if available (more accurate)
  let location: string | null = null;
  if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
    location = `${lat},${lon}`;
  } else if (address && address.trim()) {
    location = encodeURIComponent(address.trim());
  } else {
    return null;
  }

  // If no API key, return a URL that will show an error or require API key
  // User can add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to their .env.local file for client-side usage
  const keyParam = key ? `&key=${key}` : '';
  
  return `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&location=${location}${keyParam}`;
}

