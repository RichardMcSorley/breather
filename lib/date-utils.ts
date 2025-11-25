/**
 * Utility functions for handling dates in UTC
 */

/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:MM) as UTC
 * This ensures dates are stored consistently in UTC regardless of server timezone
 */
export function parseDateAsUTC(date: string, time?: string): Date {
  if (!date) {
    throw new Error("Missing date");
  }
  
  const [baseDate] = date.split("T");
  const [year, month, day] = baseDate.split("-").map(Number);
  
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error("Invalid date value");
  }
  
  const [hour, minute] = (time?.split(":").map(Number) ?? [0, 0]);
  const hourValue = Number.isNaN(hour) ? 0 : hour;
  const minuteValue = Number.isNaN(minute) ? 0 : minute;
  
  // Create date in UTC
  return new Date(Date.UTC(year, month - 1, day, hourValue, minuteValue));
}

/**
 * Parses a date string (YYYY-MM-DD) as UTC at midnight
 */
export function parseDateOnlyAsUTC(date: string): Date {
  if (!date) {
    throw new Error("Missing date");
  }
  
  const [baseDate] = date.split("T");
  const [year, month, day] = baseDate.split("-").map(Number);
  
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error("Invalid date value");
  }
  
  // Create date in UTC at midnight
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Converts EST date/time to UTC
 * EST is UTC-5, EDT (daylight saving) is UTC-4
 * For simplicity, we'll use UTC-5 (EST) - adjust if EDT is needed
 */
export function parseESTAsUTC(date: string, time?: string): Date {
  if (!date) {
    throw new Error("Missing date");
  }
  
  const [baseDate] = date.split("T");
  const [year, month, day] = baseDate.split("-").map(Number);
  
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error("Invalid date value");
  }
  
  const [hour, minute] = (time?.split(":").map(Number) ?? [0, 0]);
  const hourValue = Number.isNaN(hour) ? 0 : hour;
  const minuteValue = Number.isNaN(minute) ? 0 : minute;
  
  // EST is UTC-5, so we add 5 hours to convert EST to UTC
  const EST_OFFSET_HOURS = 5;
  
  // Add EST offset to convert to UTC
  let utcHour = hourValue + EST_OFFSET_HOURS;
  let utcDay = day;
  let utcMonth = month - 1; // JavaScript months are 0-indexed
  let utcYear = year;
  
  // Handle hour rollover
  if (utcHour >= 24) {
    utcHour -= 24;
    utcDay += 1;
    // Check if day exceeds month length
    const daysInMonth = new Date(utcYear, utcMonth + 1, 0).getDate();
    if (utcDay > daysInMonth) {
      utcDay = 1;
      utcMonth += 1;
      if (utcMonth >= 12) {
        utcMonth = 0;
        utcYear += 1;
      }
    }
  }
  
  // Create UTC date
  return new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour, minuteValue));
}

/**
 * Formats a Date object as YYYY-MM-DD string using UTC components
 */
export function formatDateAsUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets current EST date/time and converts to UTC
 */
export function getCurrentESTAsUTC(): { date: Date; timeString: string; estDateString: string } {
  const EST_OFFSET_HOURS = 5;
  const now = new Date();
  
  // Get UTC components
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDay = now.getUTCDate();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  
  // Convert UTC to EST (subtract 5 hours)
  let estHour = utcHour - EST_OFFSET_HOURS;
  let estDay = utcDay;
  let estMonth = utcMonth;
  let estYear = utcYear;
  
  // Handle day/hour rollover when subtracting hours
  if (estHour < 0) {
    estHour += 24;
    estDay -= 1;
    if (estDay < 1) {
      estMonth -= 1;
      if (estMonth < 0) {
        estMonth = 11;
        estYear -= 1;
      }
      // Get days in previous month
      const daysInPrevMonth = new Date(estYear, estMonth + 1, 0).getDate();
      estDay = daysInPrevMonth;
    }
  }
  
  // Create EST date string
  const estDateString = `${estYear}-${String(estMonth + 1).padStart(2, '0')}-${String(estDay).padStart(2, '0')}`;
  const timeString = `${String(estHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}`;
  
  // Convert EST to UTC for storage (add offset back)
  const date = parseESTAsUTC(estDateString, timeString);
  
  return { date, timeString, estDateString };
}

