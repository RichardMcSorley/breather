/**
 * Utility functions for OCR analytics and data processing
 */

/**
 * Normalize customer name for fuzzy matching
 * Removes extra whitespace, converts to lowercase, removes common prefixes/suffixes
 */
export function normalizeCustomerName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "") // Remove titles
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, ""); // Remove suffixes
}

/**
 * Check if two customer names are likely the same (fuzzy match)
 * Uses normalized comparison with some tolerance
 */
export function isSameCustomer(name1: string, name2: string): boolean {
  const normalized1 = normalizeCustomerName(name1);
  const normalized2 = normalizeCustomerName(name2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // Check if one contains the other (for partial matches)
  if (normalized1.length > 3 && normalized2.length > 3) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
  }
  
  // Check Levenshtein distance for similar names (simple implementation)
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const similarity = 1 - distance / maxLength;
  
  // Consider same if similarity > 0.85
  return similarity > 0.85;
}

/**
 * Simple Levenshtein distance calculation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Normalize address for comparison
 */
export function normalizeAddress(address: string): string {
  if (!address) return "";
  return address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "") // Remove punctuation
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir)\b/gi, ""); // Remove common street suffixes
}

/**
 * Extract street number from address (e.g., "105" from "105 Blackburn Ave")
 */
function extractStreetNumber(address: string): string | null {
  if (!address) return null;
  const match = address.trim().match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Check if two addresses are likely the same (fuzzy match)
 */
export function isSameAddress(address1: string, address2: string): boolean {
  if (!address1 || !address2) return false;
  
  // Extract and compare street numbers - if they differ, addresses are definitely different
  const streetNum1 = extractStreetNumber(address1);
  const streetNum2 = extractStreetNumber(address2);
  if (streetNum1 && streetNum2 && streetNum1 !== streetNum2) {
    return false;
  }
  
  const normalized1 = normalizeAddress(address1);
  const normalized2 = normalizeAddress(address2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // Check if one contains the other (for partial matches)
  if (normalized1.length > 10 && normalized2.length > 10) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
  }
  
  // Check Levenshtein distance for similar addresses
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const similarity = 1 - distance / maxLength;
  
  // Consider same if similarity > 0.90 (stricter than names since addresses should be more consistent)
  return similarity > 0.90;
}

/**
 * Get day of week name from number (0 = Sunday, 6 = Saturday)
 */
export function getDayOfWeekName(day: number): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[day] || "Unknown";
}

/**
 * Get hour bucket name (e.g., "12 AM - 1 AM")
 */
export function getHourBucketName(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const nextHour = hour === 23 ? 12 : (hour + 1) > 12 ? (hour + 1) - 12 : (hour + 1);
  const nextPeriod = hour < 11 ? "AM" : hour === 11 ? "PM" : "PM";
  return `${displayHour} ${period} - ${nextHour} ${nextPeriod}`;
}

/**
 * Group entries by customer address (fuzzy matching)
 * Address is used as the unique identifier since customers can have the same name
 */
export function groupByAddress(entries: Array<{ customerAddress: string; [key: string]: any }>): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  const processedAddresses = new Set<string>();
  
  for (const entry of entries) {
    if (!entry.customerAddress || entry.customerAddress.trim() === "") {
      continue; // Skip entries without addresses
    }
    
    let matchedGroup: string | null = null;
    
    // Check if this entry matches any existing group by address
    for (const [groupAddress] of groups) {
      if (isSameAddress(entry.customerAddress, groupAddress)) {
        matchedGroup = groupAddress;
        break;
      }
    }
    
    if (matchedGroup) {
      groups.get(matchedGroup)!.push(entry);
    } else {
      // Create new group using the address as the key
      const normalizedAddress = normalizeAddress(entry.customerAddress);
      if (!processedAddresses.has(normalizedAddress)) {
        groups.set(entry.customerAddress, [entry]);
        processedAddresses.add(normalizedAddress);
      } else {
        // Find the original address that matches
        for (const [groupAddress] of groups) {
          if (normalizeAddress(groupAddress) === normalizedAddress) {
            groups.get(groupAddress)!.push(entry);
            matchedGroup = groupAddress;
            break;
          }
        }
        if (!matchedGroup) {
          groups.set(entry.customerAddress, [entry]);
        }
      }
    }
  }
  
  return groups;
}

