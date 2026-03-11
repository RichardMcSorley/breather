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
  
  // Validate time format if provided
  if (time !== undefined && time !== null) {
    const timeParts = time.split(":");
    if (timeParts.length !== 2) {
      throw new Error("Invalid time format");
    }
    const [hour, minute] = timeParts.map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      throw new Error("Invalid time format");
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error("Invalid time format");
    }
    // Create date in UTC with validated time
    return new Date(Date.UTC(year, month - 1, day, hour, minute));
  }
  
  // No time provided, default to midnight
  return new Date(Date.UTC(year, month - 1, day, 0, 0));
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
 * Parses a date string (YYYY-MM-DD) as EST at midnight and converts to UTC
 * This ensures mileage entries follow the same timezone logic as transaction logs
 * EST is UTC-5, so midnight EST becomes 5am UTC the same day
 */
export function parseDateOnlyAsEST(date: string): Date {
  if (!date) {
    throw new Error("Missing date");
  }
  
  // Use parseESTAsUTC with midnight time to convert EST date to UTC
  return parseESTAsUTC(date, "00:00");
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
  
  // Validate time format if provided
  let hourValue = 0;
  let minuteValue = 0;
  if (time !== undefined && time !== null) {
    const timeParts = time.split(":");
    if (timeParts.length !== 2) {
      throw new Error("Invalid time format");
    }
    const [hour, minute] = timeParts.map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      throw new Error("Invalid time format");
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error("Invalid time format");
    }
    hourValue = hour;
    minuteValue = minute;
  }
  
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
 * Formats a Date object as YYYY-MM-DD string using Eastern Time (handles DST)
 */
export function formatDateAsET(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  
  return `${year}-${month}-${day}`;
}

/**
 * Gets current Eastern Time date/time and converts to UTC
 * Properly handles EST/EDT (Daylight Saving Time)
 */
export function getCurrentESTAsUTC(): { date: Date; timeString: string; estDateString: string } {
  const now = new Date();
  
  // Use Intl to get the correct Eastern Time components (handles DST automatically)
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = etFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  const etYear = parseInt(getPart('year'));
  const etMonth = parseInt(getPart('month'));
  const etDay = parseInt(getPart('day'));
  const etHour = parseInt(getPart('hour'));
  const etMinute = parseInt(getPart('minute'));
  
  // Create EST date string
  const estDateString = `${etYear}-${String(etMonth).padStart(2, '0')}-${String(etDay).padStart(2, '0')}`;
  const timeString = `${String(etHour).padStart(2, '0')}:${String(etMinute).padStart(2, '0')}`;
  
  // Return the actual current UTC time (which is what we want to store)
  return { date: now, timeString, estDateString };
}

