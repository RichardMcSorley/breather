/**
 * Migration script to update tags and app names across the database
 * 
 * This script migrates:
 * - Transactions: tag field
 * - OcrExport (customers): appName field
 * - DeliveryOrder (orders): appName field
 * 
 * Mappings:
 * - "Uber Driver" → "Uber Eats"
 * - "Dasher" → "DoorDash"
 * - "GH Drivers" → "GrubHub"
 * - "Shopper" → "Instacart"
 * - "Shipt" → null (removed)
 * 
 * Usage:
 *   npx tsx scripts/migrate-tags-and-sources.ts
 * 
 * Or with ts-node:
 *   npx ts-node --esm scripts/migrate-tags-and-sources.ts
 */

import mongoose from "mongoose";
import connectDB from "../lib/mongodb";
import Transaction from "../lib/models/Transaction";
import OcrExport from "../lib/models/OcrExport";
import DeliveryOrder from "../lib/models/DeliveryOrder";

// Tag/appName mapping configuration
const TAG_MAPPINGS: Record<string, string | null> = {
  "Uber Driver": "Uber Eats",
  "Dasher": "DoorDash",
  "GH Drivers": "GrubHub",
  "Shopper": "Instacart",
  "Shipt": null, // Remove Shipt
};

interface MigrationStats {
  transactions: {
    updated: number;
    skipped: number;
    errors: number;
  };
  ocrExports: {
    updated: number;
    skipped: number;
    errors: number;
  };
  deliveryOrders: {
    updated: number;
    skipped: number;
    errors: number;
  };
}

async function migrateTransactions(): Promise<MigrationStats["transactions"]> {
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log("\n📊 Migrating Transactions...");

  for (const [oldTag, newTag] of Object.entries(TAG_MAPPINGS)) {
    try {
      const query: any = { tag: oldTag };
      const update: any = newTag === null ? { $unset: { tag: "" } } : { $set: { tag: newTag } };

      const result = await Transaction.updateMany(query, update);
      stats.updated += result.modifiedCount;
      
      if (result.matchedCount > 0) {
        console.log(
          `  ✓ ${oldTag} → ${newTag === null ? "(removed)" : newTag}: ${result.modifiedCount} transactions updated`
        );
      }
    } catch (error) {
      console.error(`  ✗ Error migrating tag "${oldTag}":`, error);
      stats.errors++;
    }
  }

  // Also handle case-insensitive matches and variations
  const variations: Record<string, string | null> = {
    "uber driver": "Uber Eats",
    "dasher": "DoorDash",
    "gh drivers": "GH Drivers", // Will be handled in second pass
    "shopper": "Instacart",
    "shipt": null,
  };

  for (const [oldTag, newTag] of Object.entries(variations)) {
    try {
      // Use regex for case-insensitive matching
      const query: any = { tag: { $regex: new RegExp(`^${oldTag}$`, "i") } };
      const update: any = newTag === null ? { $unset: { tag: "" } } : { $set: { tag: newTag } };

      const result = await Transaction.updateMany(query, update);
      if (result.modifiedCount > 0) {
        stats.updated += result.modifiedCount;
        console.log(
          `  ✓ Case variation "${oldTag}" → ${newTag === null ? "(removed)" : newTag}: ${result.modifiedCount} transactions updated`
        );
      }
    } catch (error) {
      console.error(`  ✗ Error migrating tag variation "${oldTag}":`, error);
      stats.errors++;
    }
  }

  return stats;
}

async function migrateOcrExports(): Promise<MigrationStats["ocrExports"]> {
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log("\n👤 Migrating OcrExport (Customers)...");

  for (const [oldAppName, newAppName] of Object.entries(TAG_MAPPINGS)) {
    try {
      const query: any = { appName: oldAppName };
      const update: any =
        newAppName === null ? { $unset: { appName: "" } } : { $set: { appName: newAppName } };

      const result = await OcrExport.updateMany(query, update);
      stats.updated += result.modifiedCount;

      if (result.matchedCount > 0) {
        console.log(
          `  ✓ ${oldAppName} → ${newAppName === null ? "(removed)" : newAppName}: ${result.modifiedCount} customers updated`
        );
      }
    } catch (error) {
      console.error(`  ✗ Error migrating appName "${oldAppName}":`, error);
      stats.errors++;
    }
  }

  // Handle case-insensitive matches
  const variations: Record<string, string | null> = {
    "uber driver": "Uber Eats",
    "dasher": "DoorDash",
    "gh drivers": "GrubHub",
    "shopper": "Instacart",
    "shipt": null,
  };

  for (const [oldAppName, newAppName] of Object.entries(variations)) {
    try {
      const query: any = { appName: { $regex: new RegExp(`^${oldAppName}$`, "i") } };
      const update: any =
        newAppName === null ? { $unset: { appName: "" } } : { $set: { appName: newAppName } };

      const result = await OcrExport.updateMany(query, update);
      if (result.modifiedCount > 0) {
        stats.updated += result.modifiedCount;
        console.log(
          `  ✓ Case variation "${oldAppName}" → ${newAppName === null ? "(removed)" : newAppName}: ${result.modifiedCount} customers updated`
        );
      }
    } catch (error) {
      console.error(`  ✗ Error migrating appName variation "${oldAppName}":`, error);
      stats.errors++;
    }
  }

  return stats;
}

async function migrateDeliveryOrders(): Promise<MigrationStats["deliveryOrders"]> {
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log("\n📦 Migrating DeliveryOrder (Orders)...");

  for (const [oldAppName, newAppName] of Object.entries(TAG_MAPPINGS)) {
    try {
      if (newAppName === null) {
        // For DeliveryOrder, appName is required, so we'll set it to a default
        // or skip removal. Let's set it to empty string and log a warning.
        console.warn(
          `  ⚠ Warning: Cannot remove appName from DeliveryOrder (required field). Setting "${oldAppName}" to empty string.`
        );
        const query: any = { appName: oldAppName };
        const update: any = { $set: { appName: "" } };
        const result = await DeliveryOrder.updateMany(query, update);
        stats.updated += result.modifiedCount;
        if (result.matchedCount > 0) {
          console.log(`  ✓ ${oldAppName} → (empty): ${result.modifiedCount} orders updated`);
        }
      } else {
        const query: any = { appName: oldAppName };
        const update: any = { $set: { appName: newAppName } };
        const result = await DeliveryOrder.updateMany(query, update);
        stats.updated += result.modifiedCount;

        if (result.matchedCount > 0) {
          console.log(`  ✓ ${oldAppName} → ${newAppName}: ${result.modifiedCount} orders updated`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error migrating appName "${oldAppName}":`, error);
      stats.errors++;
    }
  }

  // Handle case-insensitive matches
  const variations: Record<string, string | null> = {
    "uber driver": "Uber Eats",
    "dasher": "DoorDash",
    "gh drivers": "GrubHub",
    "shopper": "Instacart",
    "shipt": "", // Empty string for required field
  };

  for (const [oldAppName, newAppName] of Object.entries(variations)) {
    try {
      const query: any = { appName: { $regex: new RegExp(`^${oldAppName}$`, "i") } };
      const update: any = { $set: { appName: newAppName || "" } };

      const result = await DeliveryOrder.updateMany(query, update);
      if (result.modifiedCount > 0) {
        stats.updated += result.modifiedCount;
        console.log(
          `  ✓ Case variation "${oldAppName}" → ${newAppName || "(empty)"}: ${result.modifiedCount} orders updated`
        );
      }
    } catch (error) {
      console.error(`  ✗ Error migrating appName variation "${oldAppName}":`, error);
      stats.errors++;
    }
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

  console.log("🚀 Starting tag and appName migration...");
  console.log("\nMappings:");
  for (const [old, new_] of Object.entries(TAG_MAPPINGS)) {
    console.log(`  - "${old}" → ${new_ === null ? "(removed)" : `"${new_}"`}`);
  }

  try {
    // Connect to MongoDB
    console.log("\n📡 Connecting to MongoDB...");
    await connectDB();
    console.log("✓ Connected to MongoDB");

    // Run migrations
    const transactionStats = await migrateTransactions();
    const ocrExportStats = await migrateOcrExports();
    const deliveryOrderStats = await migrateDeliveryOrders();

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary");
    console.log("=".repeat(60));
    console.log("\nTransactions:");
    console.log(`  Updated: ${transactionStats.updated}`);
    console.log(`  Errors: ${transactionStats.errors}`);

    console.log("\nOcrExport (Customers):");
    console.log(`  Updated: ${ocrExportStats.updated}`);
    console.log(`  Errors: ${ocrExportStats.errors}`);

    console.log("\nDeliveryOrder (Orders):");
    console.log(`  Updated: ${deliveryOrderStats.updated}`);
    console.log(`  Errors: ${deliveryOrderStats.errors}`);

    const totalUpdated =
      transactionStats.updated + ocrExportStats.updated + deliveryOrderStats.updated;
    const totalErrors =
      transactionStats.errors + ocrExportStats.errors + deliveryOrderStats.errors;

    console.log("\n" + "=".repeat(60));
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log("=".repeat(60));

    if (totalErrors === 0) {
      console.log("\n✅ Migration completed successfully!");
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
