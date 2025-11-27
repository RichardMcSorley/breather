import connectDB from "./mongodb";
import OcrExport from "./models/OcrExport";

/**
 * Normalize an address for comparison (lowercase, trim whitespace)
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check database for existing geocoded address
 * Returns geocode data if found, null otherwise
 */
async function checkDatabaseForAddress(address: string): Promise<{
  lat: number;
  lon: number;
  displayName: string;
} | null> {
  try {
    await connectDB();
    const normalizedAddress = normalizeAddress(address);
    
    // Find entries with matching normalized address that have geocode data
    const existingEntry = await OcrExport.findOne({
      customerAddress: { $regex: new RegExp(normalizedAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      lat: { $exists: true, $ne: null },
      lon: { $exists: true, $ne: null },
    })
      .sort({ updatedAt: -1 }) // Get most recently updated
      .lean();

    if (existingEntry && existingEntry.lat != null && existingEntry.lon != null) {
      return {
        lat: existingEntry.lat,
        lon: existingEntry.lon,
        displayName: existingEntry.geocodeDisplayName || address,
      };
    }

    return null;
  } catch (error) {
    console.warn(`Error checking database for address ${address}:`, error);
    return null;
  }
}

/**
 * Try to geocode an address with the Nominatim API
 */
async function tryGeocode(address: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  
  const response = await fetch(nominatimUrl, {
    headers: {
      "User-Agent": "Breather App", // Required by Nominatim
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    return null;
  }

  const result = data[0];
  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: result.display_name,
  };
}

/**
 * Generate address variations to try when the original fails
 */
function generateAddressVariations(address: string): string[] {
  const variations: string[] = [];
  
  // Try removing state abbreviation if present
  const stateAbbrMatch = address.match(/(.*),\s*([A-Z]{2})\s+(\d{5})/);
  if (stateAbbrMatch) {
    const [, streetCity, , zip] = stateAbbrMatch;
    // Try without state
    variations.push(`${streetCity} ${zip}`);
  }
  
  // Try removing zip code
  const noZip = address.replace(/,\s*\d{5}.*$/, "");
  if (noZip !== address) {
    variations.push(noZip);
  }
  
  // Try just the street and city
  const streetCityMatch = address.match(/^([^,]+,\s*[^,]+)/);
  if (streetCityMatch) {
    variations.push(streetCityMatch[1]);
  }
  
  return variations;
}

/**
 * Helper function to geocode an address
 * Returns null if geocoding fails (doesn't throw errors)
 * Checks database first before making API calls
 */
export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lon: number;
  displayName: string;
} | null> {
  if (!address || address.trim() === "") {
    return null;
  }

  try {
    // Check database first for cached geocode data
    const cachedResult = await checkDatabaseForAddress(address);
    if (cachedResult) {
      console.log(`Using cached geocode data for address: "${address}"`);
      return cachedResult;
    }

    // If not in database, try the original address with API
    let result = await tryGeocode(address);
    
    // If that fails, try variations
    if (!result) {
      const variations = generateAddressVariations(address);
      for (const variation of variations) {
        // Check database for variation too
        const cachedVariation = await checkDatabaseForAddress(variation);
        if (cachedVariation) {
          console.log(`Using cached geocode data for variation: "${variation}" (original: "${address}")`);
          return cachedVariation;
        }

        result = await tryGeocode(variation);
        if (result) {
          console.log(`Geocoded using variation: "${variation}" (original: "${address}")`);
          break;
        }
        // Respect rate limit: 1 request per second
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return result;
  } catch (error) {
    console.warn(`Geocoding error for address ${address}:`, error);
    return null;
  }
}

