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
    const screenshotData: ScreenshotData[] = [];

    for (let i = 0; i < files.length; i++) {
      onProgress?.(`Processing ${i + 1} of ${files.length} screenshots...`);

      // Convert file to base64
      const base64 = await readFileAsBase64(files[i]);

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
        throw new Error(errorData.error || `Failed to process screenshot ${i + 1}`);
      }

      const data = await response.json();
      if (data.items && data.items.length > 0) {
        // Add screenshotId to items
        const itemsWithScreenshot = data.items.map((item: any) => ({
          ...item,
          screenshotId: data.screenshotId,
        }));

        screenshotData.push({
          screenshotId: data.screenshotId,
          screenshot: data.screenshot,
          items: itemsWithScreenshot,
        });

        console.log(`✅ Processed ${itemsWithScreenshot.length} items from screenshot ${i + 1}`, {
          screenshotId: data.screenshotId,
          itemNames: itemsWithScreenshot.map((item: any) => item.productName),
        });
      }
    }

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

    // Count total items to process
    let totalItems = 0;
    for (const screenshotInfo of screenshotData) {
      totalItems += screenshotInfo.items.length;
    }

    // Process each screenshot's items with moondream
    let totalItemsProcessed = 0;

    for (const screenshotInfo of screenshotData) {
      console.log(`Processing screenshot ${screenshotInfo.screenshotId} with ${screenshotInfo.items.length} items`);

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

      // Process each item sequentially to avoid rate limits
      for (const item of itemsToProcess) {
        const itemIndex = shoppingList.items.findIndex(
          (i: any) =>
            (i._id && item._id && i._id === item._id) ||
            (i.productName === item.productName &&
              i.quantity === item.quantity &&
              i.screenshotId === item.screenshotId)
        );

        if (itemIndex >= 0) {
          totalItemsProcessed++;
          onProgress?.(
            `Cropping product ${totalItemsProcessed} of ${totalItems}: ${item.productName}...`
          );

          try {
            const cropResponse = await fetch("/api/shopping-lists/crop-item", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                shoppingListId,
                itemIndex,
                screenshotBase64: screenshotInfo.screenshot,
                productName: item.searchTerm || item.productName, // Use searchTerm (original Gemini response) instead of matched productName
              }),
            });

            if (!cropResponse.ok) {
              const errorText = await cropResponse.text();
              console.error(`Failed to crop item ${item.productName}:`, {
                status: cropResponse.status,
                statusText: cropResponse.statusText,
                error: errorText,
              });
            } else {
              const cropData = await cropResponse.json();
              console.log(`✅ Crop response for ${item.productName}:`, cropData);
            }
          } catch (err) {
            console.error(`❌ Error cropping item ${item.productName}:`, err);
          }
        } else {
          console.warn(`⚠️ Could not find item index for: ${item.productName}`);
        }
      }
    }

    console.log("✅ Cropping process complete!", {
      totalItemsProcessed,
      totalItems,
      successRate:
        totalItems > 0
          ? `${Math.round((totalItemsProcessed / totalItems) * 100)}%`
          : "0%",
    });
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
