/**
 * Google Places API helper functions (server-side only)
 */

import connectDB from "./mongodb";
import GooglePlacesCache from "./models/GooglePlacesCache";

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  rating?: number;
  user_ratings_total?: number;
}

interface GooglePlacesResponse {
  results: GooglePlaceResult[];
  status: string;
  error_message?: string;
}

/**
 * Search for places using Google Places API Text Search with caching
 * @param query - Search query (e.g., "restaurant name" or "address")
 * @param lat - Optional latitude for location bias
 * @param lon - Optional longitude for location bias
 * @param radius - Optional radius in meters (default: 5000 = 5km)
 * @param type - Optional place type filter (e.g., "restaurant" for restaurants, undefined for all places)
 * @returns Array of normalized place results
 */
export async function searchPlaces(
  query: string,
  lat?: number,
  lon?: number,
  radius: number = 5000,
  type?: string
): Promise<Array<{
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  place_id?: string;
  name?: string;
}>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  // Build the search query
  let searchQuery = query.trim();
  
  // Check cache first
  try {
    await connectDB();
    
    // Build cache query - only include fields that are defined
    const cacheQuery: any = {
      query: searchQuery,
      radius: radius,
    };
    
    if (type) {
      cacheQuery.type = type;
    } else {
      cacheQuery.type = { $exists: false };
    }
    
    if (lat !== undefined && !isNaN(lat) && lon !== undefined && !isNaN(lon)) {
      cacheQuery.lat = lat;
      cacheQuery.lon = lon;
    } else {
      cacheQuery.lat = { $exists: false };
      cacheQuery.lon = { $exists: false };
    }

    const cachedResult = await GooglePlacesCache.findOne(cacheQuery).lean();
    
    if (cachedResult && cachedResult.results) {
      console.log(`Using cached Google Places result for query: "${searchQuery}"`);
      // Normalize cached results to match expected format
      return cachedResult.results.map((place: any) => ({
        display_name: `${place.name}, ${place.formatted_address}`,
        lat: place.lat.toString(),
        lon: place.lng.toString(),
        type: place.types[0] || 'restaurant',
        place_id: place.place_id,
        name: place.name,
      }));
    }
  } catch (cacheError) {
    console.warn('Cache lookup error (continuing with API call):', cacheError);
  }

  // If not in cache, make API call
  let locationBias = '';
  if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
    locationBias = `&location=${lat},${lon}&radius=${radius}`;
  }

  // Build the API URL with optional type filter
  const typeParam = type ? `&type=${type}` : '';
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}${locationBias}${typeParam}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`);
    }

    const data: GooglePlacesResponse = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      // Cache empty results too
      try {
        const cacheData: any = {
          query: searchQuery,
          radius: radius,
          results: [],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        };
        if (type) cacheData.type = type;
        if (lat !== undefined && !isNaN(lat)) cacheData.lat = lat;
        if (lon !== undefined && !isNaN(lon)) cacheData.lon = lon;
        await GooglePlacesCache.create(cacheData);
      } catch (cacheError) {
        console.warn('Failed to cache empty results:', cacheError);
      }
      return [];
    }

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`);
    }

    // Cache the results
    try {
      const cacheData: any = {
        query: searchQuery,
        radius: radius,
        results: data.results.map((place) => ({
          place_id: place.place_id,
          name: place.name,
          formatted_address: place.formatted_address,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          types: place.types,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
        })),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      };
      if (type) cacheData.type = type;
      if (lat !== undefined && !isNaN(lat)) cacheData.lat = lat;
      if (lon !== undefined && !isNaN(lon)) cacheData.lon = lon;
      await GooglePlacesCache.create(cacheData);
      console.log(`Cached Google Places result for query: "${searchQuery}"`);
    } catch (cacheError) {
      console.warn('Failed to cache results:', cacheError);
    }

    // Normalize results to match the format expected by ShareOrderModal
    return data.results.map((place) => ({
      display_name: `${place.name}, ${place.formatted_address}`,
      lat: place.geometry.location.lat.toString(),
      lon: place.geometry.location.lng.toString(),
      type: place.types[0] || 'restaurant',
      place_id: place.place_id,
      name: place.name,
    }));
  } catch (error) {
    console.error('Google Places API error:', error);
    throw error;
  }
}

/**
 * Search for restaurants using Google Places API Text Search
 * @param query - Search query (e.g., "restaurant name" or "restaurant name city state")
 * @param lat - Optional latitude for location bias
 * @param lon - Optional longitude for location bias
 * @param radius - Optional radius in meters (default: 5000 = 5km)
 * @returns Array of normalized place results
 */
export async function searchRestaurants(
  query: string,
  lat?: number,
  lon?: number,
  radius: number = 5000
): Promise<Array<{
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  place_id?: string;
  name?: string;
}>> {
  return searchPlaces(query, lat, lon, radius, 'restaurant');
}

