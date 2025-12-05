/**
 * Formats an address string into a standardized format:
 * "streetNumber streetName, city stateAbbr, zip"
 */

export function formatAddress(address: string): string {
  if (!address) return address;
  
  // Split by comma and clean up
  const parts = address.split(',').map(part => part.trim()).filter(part => part);
  
  if (parts.length === 0) return address;
  
  // State abbreviations mapping
  const stateAbbreviations: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC'
  };
  
  // Find components
  let streetNumber = '';
  let streetName = '';
  let city = '';
  let state = '';
  let zip = '';
  
  // Parse street number and name - handle cases where they might be in separate parts
  // Also handle cases where first part might be a business name (no street number)
  let startIndex = 0;
  if (parts.length > 0) {
    const firstPart = parts[0];
    // Check if first part is just a number (street number)
    if (/^\d+$/.test(firstPart) && parts.length > 1) {
      streetNumber = firstPart;
      streetName = parts[1];
      startIndex = 2;
    } else {
      // Check if first part contains a street number
      const streetParts = firstPart.split(' ').filter(p => p);
      if (streetParts.length > 0 && /^\d+/.test(streetParts[0])) {
        // First part has street number
        streetNumber = streetParts[0];
        streetName = streetParts.slice(1).join(' ');
        startIndex = 1;
      } else {
        // First part might be a business name, look for street address in next parts
        // Check if second part is just a number (street number)
        if (parts.length > 1 && /^\d+$/.test(parts[1])) {
          // Second part is street number, third part might be street name
          streetNumber = parts[1];
          if (parts.length > 2) {
            streetName = parts[2];
            startIndex = 3;
          } else {
            startIndex = 2;
          }
        } else if (parts.length > 1) {
          // Check if second part contains a street number
          const secondPart = parts[1];
          const secondStreetParts = secondPart.split(' ').filter(p => p);
          if (secondStreetParts.length > 0 && /^\d+/.test(secondStreetParts[0])) {
            // Second part has street number, first part is business name
            streetNumber = secondStreetParts[0];
            streetName = secondStreetParts.slice(1).join(' ');
            startIndex = 2;
          } else {
            // No street number found, use first part as street name
            streetName = firstPart;
            startIndex = 1;
          }
        } else {
          streetName = firstPart;
          startIndex = 1;
        }
      }
    }
  }
  
  // Find zip code (5 digits, usually near the end)
  const zipIndex = parts.findIndex(part => /^\d{5}(-\d{4})?$/.test(part));
  if (zipIndex !== -1) {
    zip = parts[zipIndex];
  }
  
  // Find state (usually before zip, or look for state names/abbreviations)
  // Check all parts from end to beginning
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    // Skip if it's zip, "United States", or county
    if (part === zip || part === 'United States' || part.includes('County')) continue;
    
    // Check if it's a state name (full name)
    if (stateAbbreviations[part]) {
      state = part;
      break;
    }
    // Check if it's already an abbreviation (2 uppercase letters)
    if (/^[A-Z]{2}$/.test(part)) {
      state = part;
      break;
    }
    // Check if part contains state abbreviation (e.g., "KY 41101" or "Ashland, KY")
    const stateMatch = part.match(/\b([A-Z]{2})\b/);
    if (stateMatch) {
      const potentialState = stateMatch[1];
      // Verify it's a valid state abbreviation
      const isValidState = Object.values(stateAbbreviations).includes(potentialState) || 
                           Object.keys(stateAbbreviations).some(s => stateAbbreviations[s] === potentialState);
      if (isValidState) {
        state = potentialState;
        // Extract zip if it's in the same part (e.g., "KY 41101") and we haven't found it yet
        if (!zip) {
          const zipMatch = part.match(/\b(\d{5}(-\d{4})?)\b/);
          if (zipMatch) {
            zip = zipMatch[1];
          }
        }
        break;
      }
    }
  }
  
  // Find city (usually before state, but after street address)
  const stateAbbr = stateAbbreviations[state] || state;
  const stateIndex = parts.findIndex(part => 
    part === state || 
    part === stateAbbr || 
    part.includes(state) || 
    part.includes(stateAbbr)
  );
  
  if (stateIndex > startIndex) {
    // City is usually the part right before state, but skip county and street address parts
    for (let i = stateIndex - 1; i >= startIndex; i--) {
      const part = parts[i];
      // Skip if it's the street address, county, or zip
      if (part.includes('County') || 
          part === streetNumber + ' ' + streetName ||
          part === streetName ||
          part === streetNumber ||
          part === zip ||
          /^\d{5}(-\d{4})?$/.test(part)) {
        continue;
      }
      // If this part contains both city and state (e.g., "Ashland, KY"), extract city
      if (part.includes(',') && (part.includes(state) || part.includes(stateAbbr))) {
        const cityPart = part.split(',')[0].trim();
        if (cityPart && cityPart !== streetName && cityPart !== streetNumber) {
          city = cityPart;
          break;
        }
      } else {
        city = part;
        break;
      }
    }
  } else if (parts.length > startIndex) {
    // If no state found, try to find city in remaining parts (before zip if zip exists)
    const searchEnd = zipIndex !== -1 ? zipIndex : parts.length;
    for (let i = startIndex; i < searchEnd; i++) {
      const part = parts[i];
      if (!part.includes('County') && 
          part !== streetNumber + ' ' + streetName &&
          part !== streetName &&
          part !== streetNumber &&
          !/^\d{5}(-\d{4})?$/.test(part)) {
        city = part;
        break;
      }
    }
  }
  
  // Build formatted address: "streetNumber streetName, city, state zip"
  const street = streetNumber ? `${streetNumber} ${streetName}`.trim() : streetName;
  const stateAbbrFormatted = stateAbbr || state;
  
  // Build address parts
  const addressParts: string[] = [];
  if (street) addressParts.push(street);
  
  // Add city, state, zip
  if (city || stateAbbrFormatted || zip) {
    const locationParts: string[] = [];
    if (city) locationParts.push(city);
    if (stateAbbrFormatted) locationParts.push(stateAbbrFormatted);
    if (zip) locationParts.push(zip);
    if (locationParts.length > 0) {
      addressParts.push(locationParts.join(', '));
    }
  }
  
  return addressParts.join(', ');
}

