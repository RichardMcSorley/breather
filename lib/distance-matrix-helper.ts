/**
 * Google Distance Matrix API helper functions (server-side only)
 */

import connectDB from "./mongodb";
import DistanceMatrixCache from "./models/DistanceMatrixCache";

interface DistanceMatrixResponse {
  rows: Array<{
    elements: Array<{
      distance: {
        value: number; // meters
        text: string;
      };
      duration: {
        value: number; // seconds
        text: string;
      };
      status: string;
    }>;
  }>;
  status: string;
  error_message?: string;
}

/**
 * Calculate distance and duration between two coordinates using Google Distance Matrix API
 * @param originLat - Origin latitude
 * @param originLon - Origin longitude
 * @param destinationLat - Destination latitude
 * @param destinationLon - Destination longitude
 * @returns Object with distance (miles) and duration (text and seconds), or null if calculation fails
 */
export async function getDistanceAndDuration(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number
): Promise<{
  distanceMiles: number;
  durationText: string;
  durationSeconds: number;
} | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  // Round coordinates to 6 decimal places for cache key (approximately 0.1 meter precision)
  const roundedOriginLat = Math.round(originLat * 1000000) / 1000000;
  const roundedOriginLon = Math.round(originLon * 1000000) / 1000000;
  const roundedDestLat = Math.round(destinationLat * 1000000) / 1000000;
  const roundedDestLon = Math.round(destinationLon * 1000000) / 1000000;

  // Check cache first
  try {
    await connectDB();
    
    const cachedResult = await DistanceMatrixCache.findOne({
      originLat: roundedOriginLat,
      originLon: roundedOriginLon,
      destinationLat: roundedDestLat,
      destinationLon: roundedDestLon,
    }).lean();
    
    if (cachedResult) {
      console.log(`Using cached distance matrix result for ${roundedOriginLat},${roundedOriginLon} to ${roundedDestLat},${roundedDestLon}`);
      return {
        distanceMiles: cachedResult.distanceMiles,
        durationText: cachedResult.durationText,
        durationSeconds: cachedResult.durationSeconds,
      };
    }
  } catch (cacheError) {
    console.warn('Cache lookup error (continuing with API call):', cacheError);
  }

  // If not in cache, make API call
  const origin = `${originLat},${originLon}`;
  const destination = `${destinationLat},${destinationLon}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&mode=driving&key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Distance Matrix API error: ${response.status} ${response.statusText}`);
    }

    const data: DistanceMatrixResponse = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Google Distance Matrix API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`);
    }

    if (!data.rows || data.rows.length === 0 || !data.rows[0].elements || data.rows[0].elements.length === 0) {
      throw new Error('No distance data returned from API');
    }

    const element = data.rows[0].elements[0];

    if (element.status !== 'OK') {
      throw new Error(`Distance calculation failed: ${element.status}`);
    }

    // Convert distance from meters to miles
    const distanceMeters = element.distance.value;
    const distanceMiles = distanceMeters * 0.000621371; // meters to miles
    const durationSeconds = element.duration.value;
    const durationText = element.duration.text;

    // Cache the results
    try {
      await DistanceMatrixCache.create({
        originLat: roundedOriginLat,
        originLon: roundedOriginLon,
        destinationLat: roundedDestLat,
        destinationLon: roundedDestLon,
        distanceMeters,
        distanceMiles,
        durationSeconds,
        durationText,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      });
      console.log(`Cached distance matrix result for ${roundedOriginLat},${roundedOriginLon} to ${roundedDestLat},${roundedDestLon}`);
    } catch (cacheError) {
      console.warn('Failed to cache distance matrix result:', cacheError);
    }

    return {
      distanceMiles,
      durationText,
      durationSeconds,
    };
  } catch (error) {
    console.error('Google Distance Matrix API error:', error);
    throw error;
  }
}
