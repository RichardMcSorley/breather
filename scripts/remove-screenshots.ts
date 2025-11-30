/**
 * Migration script to remove screenshot fields from the database
 * 
 * This script removes the `screenshot` field from:
 * - DeliveryOrder (orders)
 * - OcrExport (customers)
 * - OcrText (OCR text entries)
 * 
 * This migration is part of the effort to stop persisting screenshots
 * going forward while cleaning up existing screenshot data.
 * 
 * Usage (recommended):
 *   npx tsx scripts/remove-screenshots.ts
 * 
 * Or with environment variable:
 *   MONGODB_URI="your-connection-string" npx tsx scripts/remove-screenshots.ts
 * 
 * Or with dotenv-cli:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/remove-screenshots.ts
 */

import mongoose from "mongoose";
import connectDB from "../lib/mongodb";
import DeliveryOrder from "../lib/models/DeliveryOrder";
import OcrExport from "../lib/models/OcrExport";
import OcrText from "../lib/models/OcrText";

interface MigrationStats {
  deliveryOrders: {
    matched: number;
    modified: number;
    errors: number;
  };
  ocrExports: {
    matched: number;
    modified: number;
    errors: number;
  };
  ocrTexts: {
    matched: number;
    modified: number;
    errors: number;
  };
}

async function removeScreenshotsFromDeliveryOrders(): Promise<MigrationStats["deliveryOrders"]> {
  const stats = {
    matched: 0,
    modified: 0,
    errors: 0,
  };

  console.log("\n📦 Removing screenshots from DeliveryOrder (Orders)...");

  try {
    // Count documents with screenshots first
    const countWithScreenshots = await DeliveryOrder.countDocuments({
      screenshot: { $exists: true, $ne: null },
    });
    
    if (countWithScreenshots === 0) {
      console.log("  ✓ No orders with screenshots found");
      return stats;
    }

    console.log(`  Found ${countWithScreenshots} orders with screenshots`);

    // Remove screenshot field from all documents
    const result = await DeliveryOrder.updateMany(
      { screenshot: { $exists: true } },
      { $unset: { screenshot: "" } }
    );

    stats.matched = result.matchedCount;
    stats.modified = result.modifiedCount;

    console.log(`  ✓ Removed screenshots from ${result.modifiedCount} orders`);
  } catch (error) {
    console.error("  ✗ Error removing screenshots from DeliveryOrder:", error);
    stats.errors++;
  }

  return stats;
}

async function removeScreenshotsFromOcrExports(): Promise<MigrationStats["ocrExports"]> {
  const stats = {
    matched: 0,
    modified: 0,
    errors: 0,
  };

  console.log("\n👤 Removing screenshots from OcrExport (Customers)...");

  try {
    // Count documents with screenshots first
    const countWithScreenshots = await OcrExport.countDocuments({
      screenshot: { $exists: true, $ne: null },
    });
    
    if (countWithScreenshots === 0) {
      console.log("  ✓ No customers with screenshots found");
      return stats;
    }

    console.log(`  Found ${countWithScreenshots} customers with screenshots`);

    // Remove screenshot field from all documents
    const result = await OcrExport.updateMany(
      { screenshot: { $exists: true } },
      { $unset: { screenshot: "" } }
    );

    stats.matched = result.matchedCount;
    stats.modified = result.modifiedCount;

    console.log(`  ✓ Removed screenshots from ${result.modifiedCount} customers`);
  } catch (error) {
    console.error("  ✗ Error removing screenshots from OcrExport:", error);
    stats.errors++;
  }

  return stats;
}

async function removeScreenshotsFromOcrTexts(): Promise<MigrationStats["ocrTexts"]> {
  const stats = {
    matched: 0,
    modified: 0,
    errors: 0,
  };

  console.log("\n📄 Removing screenshots from OcrText (OCR Text Entries)...");

  try {
    // Count documents with screenshots first
    const countWithScreenshots = await OcrText.countDocuments({
      screenshot: { $exists: true, $ne: null },
    });
    
    if (countWithScreenshots === 0) {
      console.log("  ✓ No OCR text entries with screenshots found");
      return stats;
    }

    console.log(`  Found ${countWithScreenshots} OCR text entries with screenshots`);

    // Remove screenshot field from all documents
    const result = await OcrText.updateMany(
      { screenshot: { $exists: true } },
      { $unset: { screenshot: "" } }
    );

    stats.matched = result.matchedCount;
    stats.modified = result.modifiedCount;

    console.log(`  ✓ Removed screenshots from ${result.modifiedCount} OCR text entries`);
  } catch (error) {
    console.error("  ✗ Error removing screenshots from OcrText:", error);
    stats.errors++;
  }

  return stats;
}

async function main() {
  // Check for required environment variable
  if (!process.env.MONGODB_URI) {
    console.error("❌ Error: MONGODB_URI environment variable is not set.");
    console.error("   Please set it in .env.local or .env file, or export it in your shell.");
    process.exit(1);
  }

  console.log("🚀 Starting screenshot removal migration...");
  console.log("\nThis will remove the 'screenshot' field from:");
  console.log("  - DeliveryOrder (orders)");
  console.log("  - OcrExport (customers)");
  console.log("  - OcrText (OCR text entries)");

  try {
    // Connect to MongoDB
    console.log("\n📡 Connecting to MongoDB...");
    await connectDB();
    console.log("✓ Connected to MongoDB");

    // Run migrations
    const deliveryOrderStats = await removeScreenshotsFromDeliveryOrders();
    const ocrExportStats = await removeScreenshotsFromOcrExports();
    const ocrTextStats = await removeScreenshotsFromOcrTexts();

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary");
    console.log("=".repeat(60));
    
    console.log("\nDeliveryOrder (Orders):");
    console.log(`  Matched: ${deliveryOrderStats.matched}`);
    console.log(`  Modified: ${deliveryOrderStats.modified}`);
    console.log(`  Errors: ${deliveryOrderStats.errors}`);

    console.log("\nOcrExport (Customers):");
    console.log(`  Matched: ${ocrExportStats.matched}`);
    console.log(`  Modified: ${ocrExportStats.modified}`);
    console.log(`  Errors: ${ocrExportStats.errors}`);

    console.log("\nOcrText (OCR Text Entries):");
    console.log(`  Matched: ${ocrTextStats.matched}`);
    console.log(`  Modified: ${ocrTextStats.modified}`);
    console.log(`  Errors: ${ocrTextStats.errors}`);

    const totalMatched =
      deliveryOrderStats.matched + ocrExportStats.matched + ocrTextStats.matched;
    const totalModified =
      deliveryOrderStats.modified + ocrExportStats.modified + ocrTextStats.modified;
    const totalErrors =
      deliveryOrderStats.errors + ocrExportStats.errors + ocrTextStats.errors;

    console.log("\n" + "=".repeat(60));
    console.log(`Total Matched: ${totalMatched}`);
    console.log(`Total Modified: ${totalModified}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log("=".repeat(60));

    if (totalErrors === 0) {
      console.log("\n✅ Migration completed successfully!");
      console.log("   Screenshots have been removed from all collections.");
    } else {
      console.log("\n⚠️  Migration completed with errors. Please review the output above.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("\n🔌 MongoDB connection closed");
  }
}

// Run the migration
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

