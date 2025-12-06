#!/usr/bin/env tsx

/**
 * Backfill script to calculate and cache missing distance matrix entries
 * 
 * This script:
 * 1. Finds all income transactions with linkedDeliveryOrders that have valid coordinates
 * 2. Calculates expected route segments (same logic as frontend)
 * 3. Checks which segments are missing from the distance matrix cache
 * 4. Calculates and caches the missing segments using the Google Distance Matrix API
 */

// CRITICAL: Load environment variables BEFORE any other imports
// This must happen first because mongodb.ts checks for MONGODB_URI on import
// Use require to ensure immediate execution before ES6 imports are processed
const dotenv = require("dotenv");
const { resolve } = require("path");

// Load .env.local if it exists, otherwise fall back to .env
const envLocalPath = resolve(process.cwd(), ".env.local");
const envPath = resolve(process.cwd(), ".env");
dotenv.config({ path: envLocalPath });
dotenv.config({ path: envPath });

// Now we can safely import modules that depend on environment variables
import connectDB from "../lib/mongodb";
// Import models to ensure they're registered with Mongoose
import Transaction from "../lib/models/Transaction";
import DeliveryOrder from "../lib/models/DeliveryOrder";
import OcrExport from "../lib/models/OcrExport";
import DistanceMatrixCache from "../lib/models/DistanceMatrixCache";
import { getDistanceAndDuration } from "../lib/distance-matrix-helper";
import mongoose from "mongoose";

// Ensure models are registered (Next.js does this automatically, but scripts need explicit registration)
// The imports above should register them, but we'll reference them to be sure
void DeliveryOrder;
void OcrExport;

interface RouteSegment {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  type: 'restaurant-to-restaurant' | 'restaurant-to-customer' | 'customer-to-customer';
}

interface Restaurant {
  lat?: number;
  lon?: number;
  name: string;
  orderIndex: number;
  restaurantIndex: number;
}

interface BackfillResult {
  transactionId: string;
  date: string;
  expectedSegments: RouteSegment[];
  cachedSegments: number;
  calculatedSegments: number;
  failedSegments: number;
  errors: string[];
}

function roundCoordinate(coord: number): number {
  return Math.round(coord * 1000000) / 1000000;
}

function calculateExpectedSegments(
  linkedDeliveryOrders: any[],
  linkedOcrExports: any[]
): RouteSegment[] {
  const segments: RouteSegment[] = [];

  // Get all restaurants (main + additional) with their indices
  const allRestaurants: Restaurant[] = [];
  linkedDeliveryOrders.forEach((order, orderIdx) => {
    if (order.restaurantLat !== undefined && order.restaurantLon !== undefined) {
      allRestaurants.push({
        lat: order.restaurantLat,
        lon: order.restaurantLon,
        name: order.restaurantName,
        orderIndex: orderIdx,
        restaurantIndex: -1, // -1 means main restaurant
      });
    }
    // Add additional restaurants
    if (order.additionalRestaurants) {
      order.additionalRestaurants.forEach((restaurant: any, restaurantIdx: number) => {
        if (restaurant.lat !== undefined && restaurant.lon !== undefined) {
          allRestaurants.push({
            lat: restaurant.lat,
            lon: restaurant.lon,
            name: restaurant.name,
            orderIndex: orderIdx,
            restaurantIndex: restaurantIdx,
          });
        }
      });
    }
  });

  // Get all customers
  const allCustomers = linkedOcrExports || [];

  // Calculate segments between restaurants
  for (let i = 0; i < allRestaurants.length - 1; i++) {
    const from = allRestaurants[i];
    const to = allRestaurants[i + 1];
    if (from.lat !== undefined && from.lon !== undefined && to.lat !== undefined && to.lon !== undefined) {
      segments.push({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        type: 'restaurant-to-restaurant',
      });
    }
  }

  // Calculate segment from last restaurant to first customer
  if (allRestaurants.length > 0 && allCustomers.length > 0) {
    const lastRestaurant = allRestaurants[allRestaurants.length - 1];
    const firstCustomer = allCustomers[0];
    if (lastRestaurant.lat !== undefined && lastRestaurant.lon !== undefined && 
        firstCustomer.lat !== undefined && firstCustomer.lon !== undefined) {
      segments.push({
        fromLat: lastRestaurant.lat,
        fromLon: lastRestaurant.lon,
        toLat: firstCustomer.lat,
        toLon: firstCustomer.lon,
        type: 'restaurant-to-customer',
      });
    }
  }

  // Calculate segments between customers
  for (let i = 0; i < allCustomers.length - 1; i++) {
    const from = allCustomers[i];
    const to = allCustomers[i + 1];
    if (from.lat !== undefined && from.lon !== undefined && to.lat !== undefined && to.lon !== undefined) {
      segments.push({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        type: 'customer-to-customer',
      });
    }
  }

  return segments;
}

async function checkSegmentInCache(segment: RouteSegment): Promise<boolean> {
  const roundedOriginLat = roundCoordinate(segment.fromLat);
  const roundedOriginLon = roundCoordinate(segment.fromLon);
  const roundedDestLat = roundCoordinate(segment.toLat);
  const roundedDestLon = roundCoordinate(segment.toLon);

  const cached = await DistanceMatrixCache.findOne({
    originLat: roundedOriginLat,
    originLon: roundedOriginLon,
    destinationLat: roundedDestLat,
    destinationLon: roundedDestLon,
  }).lean();

  return !!cached;
}

async function calculateAndCacheSegment(segment: RouteSegment): Promise<boolean> {
  // Skip segments with null or invalid coordinates
  if (
    segment.fromLat == null || 
    segment.fromLon == null || 
    segment.toLat == null || 
    segment.toLon == null ||
    isNaN(segment.fromLat) ||
    isNaN(segment.fromLon) ||
    isNaN(segment.toLat) ||
    isNaN(segment.toLon)
  ) {
    return false;
  }

  try {
    const result = await getDistanceAndDuration(
      segment.fromLat,
      segment.fromLon,
      segment.toLat,
      segment.toLon
    );
    return result !== null;
  } catch (error) {
    console.error(`Failed to calculate segment (${segment.fromLat}, ${segment.fromLon}) -> (${segment.toLat}, ${segment.toLon}):`, error);
    return false;
  }
}

async function backfillTransaction(transaction: any): Promise<BackfillResult> {
  const result: BackfillResult = {
    transactionId: transaction._id.toString(),
    date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : 'unknown',
    expectedSegments: [],
    cachedSegments: 0,
    calculatedSegments: 0,
    failedSegments: 0,
    errors: [],
  };

  // Check if transaction has linked delivery orders
  const linkedDeliveryOrders = transaction.linkedDeliveryOrderIds || [];
  const linkedOcrExports = transaction.linkedOcrExportIds || [];

  // If no linked orders, no segments to calculate
  if (linkedDeliveryOrders.length === 0) {
    return result;
  }

  // Calculate expected segments
  result.expectedSegments = calculateExpectedSegments(linkedDeliveryOrders, linkedOcrExports);

  if (result.expectedSegments.length === 0) {
    return result;
  }

  // Check which segments are in cache and calculate missing ones
  for (const segment of result.expectedSegments) {
    const inCache = await checkSegmentInCache(segment);
    if (inCache) {
      result.cachedSegments++;
    } else {
      // Calculate and cache the missing segment
      const success = await calculateAndCacheSegment(segment);
      if (success) {
        result.calculatedSegments++;
      } else {
        result.failedSegments++;
        result.errors.push(`Failed to calculate ${segment.type} segment`);
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return result;
}

async function main() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Connected to database\n');

    // Ensure models are registered after connection
    // In Next.js, models are registered via imports, but in standalone scripts we need to ensure they're available
    if (!mongoose.models.DeliveryOrder) {
      DeliveryOrder;
    }
    if (!mongoose.models.OcrExport) {
      OcrExport;
    }

    // Fetch all income transactions with linked delivery orders
    console.log('Fetching income transactions with linked delivery orders...');
    const transactions = await Transaction.find({
      type: 'income',
      linkedDeliveryOrderIds: { $exists: true, $ne: [] },
    })
      .populate('linkedDeliveryOrderIds', 'restaurantName restaurantAddress restaurantLat restaurantLon restaurantPlaceId additionalRestaurants')
      .populate('linkedOcrExportIds', 'customerName customerAddress lat lon placeId')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    console.log(`Found ${transactions.length} income transactions with linked delivery orders\n`);

    if (transactions.length === 0) {
      console.log('No transactions to process.');
      process.exit(0);
    }

    // Process each transaction
    console.log('Processing transactions and calculating missing distance matrix entries...\n');
    const results: BackfillResult[] = [];
    let totalCalculated = 0;
    let totalFailed = 0;
    let totalCached = 0;

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      process.stdout.write(`\rProcessing transaction ${i + 1}/${transactions.length}...`);
      const result = await backfillTransaction(transaction);
      results.push(result);
      totalCalculated += result.calculatedSegments;
      totalFailed += result.failedSegments;
      totalCached += result.cachedSegments;
    }
    console.log('\n');

    // Generate summary
    const transactionsWithSegments = results.filter(r => r.expectedSegments.length > 0).length;
    const transactionsWithCalculations = results.filter(r => r.calculatedSegments > 0).length;
    const transactionsWithFailures = results.filter(r => r.failedSegments > 0).length;
    const totalExpectedSegments = results.reduce((sum, r) => sum + r.expectedSegments.length, 0);

    console.log('='.repeat(80));
    console.log('BACKFILL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total transactions processed: ${transactions.length}`);
    console.log(`Transactions with route segments: ${transactionsWithSegments}`);
    console.log(`Total expected segments: ${totalExpectedSegments}`);
    console.log(`Already cached segments: ${totalCached}`);
    console.log(`Newly calculated segments: ${totalCalculated}`);
    console.log(`Failed segments: ${totalFailed}`);
    console.log(`Transactions with new calculations: ${transactionsWithCalculations}`);
    console.log(`Transactions with failures: ${transactionsWithFailures}`);
    console.log('='.repeat(80));
    console.log();

    // Show transactions with calculations
    if (transactionsWithCalculations > 0) {
      console.log('TRANSACTIONS WITH NEW CALCULATIONS:');
      console.log('-'.repeat(80));
      results
        .filter(r => r.calculatedSegments > 0)
        .slice(0, 20)
        .forEach(result => {
          console.log(`Transaction ID: ${result.transactionId}, Date: ${result.date}`);
          console.log(`  Calculated: ${result.calculatedSegments}, Cached: ${result.cachedSegments}, Failed: ${result.failedSegments}`);
        });

      if (transactionsWithCalculations > 20) {
        console.log(`\n... and ${transactionsWithCalculations - 20} more transactions with new calculations`);
      }
    }

    // Show transactions with failures
    if (transactionsWithFailures > 0) {
      console.log('\n\nTRANSACTIONS WITH FAILED CALCULATIONS:');
      console.log('-'.repeat(80));
      results
        .filter(r => r.failedSegments > 0)
        .slice(0, 10)
        .forEach(result => {
          console.log(`Transaction ID: ${result.transactionId}, Date: ${result.date}`);
          console.log(`  Errors: ${result.errors.join(', ')}`);
        });

      if (transactionsWithFailures > 10) {
        console.log(`\n... and ${transactionsWithFailures - 10} more transactions with failures`);
      }
    }

    console.log('\n\nBackfill complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error running backfill:', error);
    process.exit(1);
  }
}

main();

