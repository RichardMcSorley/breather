/**
 * Utility functions for opening maps and sharing addresses
 */

/**
 * Opens an address in Apple Maps (preferred on iOS) or Google Maps (fallback)
 */
export function openInMaps(address: string): void {
  if (!address || address.trim() === "") {
    console.warn("Cannot open maps: address is empty");
    return;
  }

  const encodedAddress = encodeURIComponent(address.trim());
  
  // Try Apple Maps first (works on iOS and macOS)
  // On iOS, this will open in Apple Maps app if available, otherwise Safari
  const appleMapsUrl = `https://maps.apple.com/?q=${encodedAddress}`;
  
  // Fallback to Google Maps
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  
  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    // On iOS, try Apple Maps first
    window.open(appleMapsUrl, '_blank');
  } else {
    // On other platforms, try Google Maps
    window.open(googleMapsUrl, '_blank');
  }
}

/**
 * Shares an address using the Web Share API (iOS native share sheet)
 * Falls back to copying to clipboard if Web Share API is not available
 */
export async function shareAddress(
  address: string, 
  customerName?: string
): Promise<void> {
  if (!address || address.trim() === "") {
    console.warn("Cannot share: address is empty");
    return;
  }

  const shareText = customerName 
    ? `${customerName}: ${address.trim()}`
    : address.trim();

  // Try Tesla app URL scheme first (iOS)
  // Tesla app accepts navigation requests via URL scheme
  const teslaUrl = `tesla://navigate?address=${encodeURIComponent(address.trim())}`;
  
  // Apple Maps URL for sharing
  const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(address.trim())}`;

  // Check if Web Share API is available (iOS Safari, Chrome on Android, etc.)
  if (navigator.share) {
    try {
      await navigator.share({
        title: customerName || 'Location',
        text: shareText,
        url: appleMapsUrl, // Share Apple Maps URL so Tesla can pick it up
      });
      return;
    } catch (error) {
      // User cancelled or error occurred
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
      // Fall through to fallback methods
    }
  }

  // Fallback 1: Try to open Tesla app directly (iOS)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    // Try Tesla app URL scheme
    const teslaLink = document.createElement('a');
    teslaLink.href = teslaUrl;
    teslaLink.style.display = 'none';
    document.body.appendChild(teslaLink);
    
    // Try to open Tesla app, but it will fail silently if app is not installed
    teslaLink.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(teslaLink);
    }, 100);
    
    // Also try Web Share API with just the text (might work better)
    // This will show native iOS share sheet which includes Tesla app if installed
    if (navigator.share) {
      try {
        await navigator.share({
          text: shareText,
        });
        return;
      } catch (error) {
        // User cancelled, continue to clipboard fallback
      }
    }
  }

  // Fallback 2: Copy to clipboard
  try {
    await navigator.clipboard.writeText(shareText);
    // Show a brief notification (you might want to use a toast library)
    alert(`Address copied to clipboard: ${shareText}`);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    // Last resort: show the address in an alert
    alert(`Address: ${shareText}\n\nYou can copy this manually.`);
  }
}

/**
 * Opens address in Tesla app if available, otherwise falls back to share
 */
export async function shareWithTesla(
  address: string,
  customerName?: string
): Promise<void> {
  if (!address || address.trim() === "") {
    console.warn("Cannot share with Tesla: address is empty");
    return;
  }

  const encodedAddress = encodeURIComponent(address.trim());
  const teslaUrl = `tesla://navigate?address=${encodedAddress}`;
  
  // Try Web Share API first (best for iOS - shows native share sheet with Tesla)
  if (navigator.share) {
    const shareText = customerName 
      ? `${customerName}: ${address.trim()}`
      : address.trim();
    
    const appleMapsUrl = `https://maps.apple.com/?q=${encodedAddress}`;
    
    try {
      await navigator.share({
        title: customerName || 'Location',
        text: shareText,
        url: appleMapsUrl,
      });
      return;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
    }
  }

  // Try direct Tesla URL scheme (iOS)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    // Create a hidden link and try to open Tesla app
    const teslaLink = document.createElement('a');
    teslaLink.href = teslaUrl;
    teslaLink.style.display = 'none';
    document.body.appendChild(teslaLink);
    teslaLink.click();
    
    setTimeout(() => {
      document.body.removeChild(teslaLink);
    }, 100);
    
    // If Web Share API is available, also try that as it's more reliable
    if (navigator.share) {
      try {
        const shareText = customerName 
          ? `${customerName}: ${address.trim()}`
          : address.trim();
        await navigator.share({ text: shareText });
        return;
      } catch (error) {
        // User cancelled
      }
    }
  }

  // Final fallback: use regular share function
  await shareAddress(address, customerName);
}
