/**
 * Barcode normalization utilities for handling various UPC/EAN formats
 * including broken vendor formats like "00 + body11" (missing check digit)
 */

/**
 * Compute UPC-A check digit from the first 11 digits.
 * Algorithm: Sum of odd positions (1-indexed) × 3 + sum of even positions × 1
 */
export function upcCheckDigit(body11: string): string {
  const digits = body11.split("").map((d) => parseInt(d, 10));
  
  // Positions here are 0-based: 0,2,4,... are the 'odd' positions (1-indexed)
  const sumOdd = digits.filter((_, i) => i % 2 === 0).reduce((sum, d) => sum + d, 0);
  const sumEven = digits.filter((_, i) => i % 2 === 1).reduce((sum, d) => sum + d, 0);
  
  const total = sumOdd * 3 + sumEven;
  return String((10 - (total % 10)) % 10);
}

/**
 * Normalize lots of bad vendor formats to a 12-digit UPC-A string.
 * 
 * Handles:
 * - Real 12-digit UPC-A
 * - 11-digit (missing check digit)
 * - 13-digit EAN with leading 0
 * - The broken '00 + body11' 13-digit value (missing check digit)
 * 
 * @param raw - Raw barcode string (may contain non-digits)
 * @returns Normalized 12-digit UPC-A string
 */
export function normalizeBarcode(raw: string): string {
  // Keep digits only
  let digits = raw.replace(/\D/g, "");
  
  if (digits.length === 0) {
    return "";
  }

  // Case 1: broken 13-digit format: "00" + 11-digit body (no check digit)
  if (digits.length === 13 && digits.startsWith("00")) {
    const body11 = digits.slice(-11); // last 11 digits are the body
    const cd = upcCheckDigit(body11);
    return body11 + cd; // → 12-digit UPC-A
  }

  // Case 2: proper EAN-13 that is just '0' + UPC-A
  if (digits.length === 13 && digits[0] === "0") {
    digits = digits.slice(1); // drop leading 0 → 12-digit UPC-A
    // Recalculate check digit for UPC-A
    const body11 = digits.slice(0, 11);
    return body11 + upcCheckDigit(body11);
  }

  // Case 3: 11-digit UPC missing check digit
  if (digits.length === 11) {
    return digits + upcCheckDigit(digits);
  }

  // Case 4: already 12-digit UPC-A; force correct check digit
  if (digits.length === 12) {
    const body11 = digits.slice(0, 11);
    return body11 + upcCheckDigit(body11);
  }

  // For other lengths, return as-is (or could pad/truncate, but let's be conservative)
  return digits;
}

/**
 * Check if two barcodes match after normalization.
 * 
 * @param a - First barcode string
 * @param b - Second barcode string
 * @returns true if normalized barcodes match
 */
export function barcodesMatch(a: string, b: string): boolean {
  const normalizedA = normalizeBarcode(a);
  const normalizedB = normalizeBarcode(b);
  
  if (!normalizedA || !normalizedB) {
    return false;
  }
  
  return normalizedA === normalizedB;
}
