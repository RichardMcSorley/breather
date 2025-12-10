import { useState, useRef } from "react";

interface ScreenshotData {
  screenshotId: string;
  screenshot: string;
  items: any[];
}

interface UseScreenshotProcessingOptions {
  locationId: string;
  selectedApp: string;
  selectedCustomers: string[];
  onProgress?: (message: string) => void;
  onError?: (error: string) => void;
}

export function useScreenshotProcessing({
  locationId,
  selectedApp,
  selectedCustomers,
  onProgress,
  onError,
}: UseScreenshotProcessingOptions) {
  const [uploading, setUploading] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const processScreenshots = async (
    files: FileList
  ): Promise<ScreenshotData[]> => {
    onProgress?.(`Processing ${files.length} screenshots in parallel...`);

    // Process all screenshots in parallel
    const screenshotPromises = Array.from(files).map(async (file, index) => {
      try {
        // Convert file to base64
        const base64 = await readFileAsBase64(file);

        // Process single screenshot
        const response = await fetch("/api/shopping-lists/process-screenshot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            screenshot: base64,
            locationId: locationId,
            app: selectedApp,
            customers: selectedCustomers,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: "Failed to process screenshot",
          }));
          throw new Error(errorData.error || `Failed to process screenshot ${index + 1}`);
        }

        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // Add screenshotId to items
          const itemsWithScreenshot = data.items.map((item: any) => ({
            ...item,
            screenshotId: data.screenshotId,
          }));

          console.log(`✅ Processed ${itemsWithScreenshot.length} items from screenshot ${index + 1}`, {
            screenshotId: data.screenshotId,
            itemNames: itemsWithScreenshot.map((item: any) => item.productName),
          });

          return {
            screenshotId: data.screenshotId,
            screenshot: data.screenshot,
            items: itemsWithScreenshot,
          };
        }
        return null;
      } catch (error) {
        console.error(`❌ Error processing screenshot ${index + 1}:`, error);
        onError?.(error instanceof Error ? error.message : `Failed to process screenshot ${index + 1}`);
        return null;
      }
    });

    // Wait for all screenshots to complete (using allSettled to handle individual failures)
    const results = await Promise.allSettled(screenshotPromises);
    const screenshotData: ScreenshotData[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        screenshotData.push(result.value);
      } else if (result.status === "rejected") {
        console.error(`Screenshot ${index + 1} failed:`, result.reason);
        onError?.(result.reason instanceof Error ? result.reason.message : `Failed to process screenshot ${index + 1}`);
      }
    });

    onProgress?.(`✅ Processed ${screenshotData.length} of ${files.length} screenshots successfully`);
    return screenshotData;
  };

  const cropItems = async (
    shoppingListId: string,
    screenshotData: ScreenshotData[]
  ): Promise<void> => {
    if (screenshotData.length === 0) {
      return;
    }

    onProgress?.("Cropping product images...");

    // Fetch the updated shopping list to get item indices
    console.log("📥 Fetching shopping list for cropping...");
    const listResponse = await fetch(`/api/shopping-lists/${shoppingListId}`);
    if (!listResponse.ok) {
      throw new Error("Failed to fetch shopping list");
    }
    const shoppingList = await listResponse.json();

    console.log("✅ Shopping list fetched for cropping:", {
      totalItems: shoppingList.items?.length || 0,
      screenshotDataCount: screenshotData.length,
      shoppingListId,
    });

    // Flatten all items from all screenshots into a single array with their metadata
    const itemsToCrop: Array<{
      item: any;
      itemIndex: number;
      screenshotBase64: string;
      productName: string;
    }> = [];

    for (const screenshotInfo of screenshotData) {
      console.log(`Preparing items from screenshot ${screenshotInfo.screenshotId} with ${screenshotInfo.items.length} items`);

      // Find items from this screenshot in the shopping list
      const itemsToProcess = shoppingList.items.filter((listItem: any) => {
        return screenshotInfo.items.some(
          (screenshotItem: any) =>
            listItem.productName === screenshotItem.productName &&
            listItem.quantity === screenshotItem.quantity &&
            listItem.screenshotId === screenshotInfo.screenshotId
        );
      });

      console.log(`Found ${itemsToProcess.length} items to process for screenshot ${screenshotInfo.screenshotId}`);

      // Add items to the flat array
      for (const item of itemsToProcess) {
        const itemIndex = shoppingList.items.findIndex(
          (i: any) =>
            (i._id && item._id && i._id === item._id) ||
            (i.productName === item.productName &&
              i.quantity === item.quantity &&
              i.screenshotId === item.screenshotId)
        );

        if (itemIndex >= 0) {
          itemsToCrop.push({
            item,
            itemIndex,
            screenshotBase64: screenshotInfo.screenshot,
            productName: item.searchTerm || item.productName,
          });
        } else {
          console.warn(`⚠️ Could not find item index for: ${item.productName}`);
        }
      }
    }

    const totalItems = itemsToCrop.length;
    onProgress?.(`Cropping ${totalItems} product images in parallel...`);

    // Process all items in parallel with progress tracking
    let completedCount = 0;
    const updateProgress = () => {
      completedCount++;
      onProgress?.(`Cropping ${completedCount} of ${totalItems} products...`);
    };

    const cropPromises = itemsToCrop.map(async ({ item, itemIndex, screenshotBase64, productName }) => {
      try {
        const cropResponse = await fetch("/api/shopping-lists/crop-item", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shoppingListId,
            itemIndex,
            screenshotBase64,
            productName,
          }),
        });

        updateProgress();

        if (!cropResponse.ok) {
          const errorText = await cropResponse.text();
          console.error(`Failed to crop item ${productName}:`, {
            status: cropResponse.status,
            statusText: cropResponse.statusText,
            error: errorText,
          });
          return { success: false, productName };
        } else {
          const cropData = await cropResponse.json();
          console.log(`✅ Crop response for ${productName}:`, cropData);
          return { success: true, productName };
        }
      } catch (err) {
        updateProgress();
        console.error(`❌ Error cropping item ${productName}:`, err);
        return { success: false, productName, error: err };
      }
    });

    // Wait for all crops to complete
    const results = await Promise.allSettled(cropPromises);
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value?.success === true
    ).length;
    const failed = results.length - successful;

    console.log("✅ Cropping process complete!", {
      totalItems,
      successful,
      failed,
      successRate:
        totalItems > 0
          ? `${Math.round((successful / totalItems) * 100)}%`
          : "0%",
    });

    onProgress?.(`✅ Cropped ${successful} of ${totalItems} products successfully`);
  };

  return {
    uploading,
    setUploading,
    processingComplete,
    setProcessingComplete,
    readFileAsBase64,
    processScreenshots,
    cropItems,
  };
}
