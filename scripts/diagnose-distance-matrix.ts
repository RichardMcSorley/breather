#!/usr/bin/env tsx

/**
 * Diagnostic script to identify missing distance matrix calculations for transactions
 * 
 * This script:
 * 1. Fetches all income transactions with linkedDeliveryOrders
 * 2. Calculates expected route segments (same logic as frontend)
 * 3. Checks which segments are missing from the distance matrix cache
 * 4. Reports statistics and details
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

interface DiagnosticResult {
  transactionId: string;
  date: string;
  hasLinkedOrders: boolean;
  hasLinkedCustomers: boolean;
  expectedSegments: RouteSegment[];
  cachedSegments: number;
  missingSegments: RouteSegment[];
  issues: string[];
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

async function diagnoseTransaction(transaction: any): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    transactionId: transaction._id.toString(),
    date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : 'unknown',
    hasLinkedOrders: false,
    hasLinkedCustomers: false,
    expectedSegments: [],
    cachedSegments: 0,
    missingSegments: [],
    issues: [],
  };

  // Check if transaction has linked delivery orders
  const linkedDeliveryOrders = transaction.linkedDeliveryOrderIds || [];
  result.hasLinkedOrders = linkedDeliveryOrders.length > 0;

  // Check if transaction has linked customers
  const linkedOcrExports = transaction.linkedOcrExportIds || [];
  result.hasLinkedCustomers = linkedOcrExports.length > 0;

  // If no linked orders, no segments to calculate
  if (!result.hasLinkedOrders) {
    result.issues.push('No linked delivery orders');
    return result;
  }

  // Calculate expected segments
  result.expectedSegments = calculateExpectedSegments(linkedDeliveryOrders, linkedOcrExports);

  if (result.expectedSegments.length === 0) {
    result.issues.push('No valid segments (missing coordinates)');
    return result;
  }

  // Check which segments are in cache
  for (const segment of result.expectedSegments) {
    const inCache = await checkSegmentInCache(segment);
    if (inCache) {
      result.cachedSegments++;
    } else {
      result.missingSegments.push(segment);
    }
  }

  // Identify specific issues
  if (result.missingSegments.length > 0) {
    result.issues.push(`${result.missingSegments.length} missing segment(s)`);
  }

  // Check for missing coordinates
  const ordersWithoutCoords = linkedDeliveryOrders.filter(
    (order: any) => !order.restaurantLat || !order.restaurantLon
  );
  if (ordersWithoutCoords.length > 0) {
    result.issues.push(`${ordersWithoutCoords.length} order(s) missing restaurant coordinates`);
  }

  const customersWithoutCoords = linkedOcrExports.filter(
    (customer: any) => !customer.lat || !customer.lon
  );
  if (customersWithoutCoords.length > 0) {
    result.issues.push(`${customersWithoutCoords.length} customer(s) missing coordinates`);
  }

  return result;
}

async function main() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Connected to database\n');

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
      console.log('No transactions to analyze.');
      process.exit(0);
    }

    // Diagnose each transaction
    console.log('Analyzing transactions...\n');
    const results: DiagnosticResult[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      process.stdout.write(`\rProcessing transaction ${i + 1}/${transactions.length}...`);
      const result = await diagnoseTransaction(transaction);
      results.push(result);
    }
    console.log('\n');

    // Generate statistics
    const totalTransactions = results.length;
    const transactionsWithSegments = results.filter(r => r.expectedSegments.length > 0).length;
    const totalExpectedSegments = results.reduce((sum, r) => sum + r.expectedSegments.length, 0);
    const totalCachedSegments = results.reduce((sum, r) => sum + r.cachedSegments, 0);
    const totalMissingSegments = results.reduce((sum, r) => sum + r.missingSegments.length, 0);
    const transactionsWithMissingSegments = results.filter(r => r.missingSegments.length > 0).length;
    const transactionsWithoutCoords = results.filter(r => 
      r.issues.some(issue => issue.includes('missing') && issue.includes('coordinates'))
    ).length;

    console.log('='.repeat(80));
    console.log('DIAGNOSTIC SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total transactions analyzed: ${totalTransactions}`);
    console.log(`Transactions with route segments: ${transactionsWithSegments}`);
    console.log(`Total expected segments: ${totalExpectedSegments}`);
    console.log(`Cached segments: ${totalCachedSegments}`);
    console.log(`Missing segments: ${totalMissingSegments}`);
    console.log(`Transactions with missing segments: ${transactionsWithMissingSegments}`);
    console.log(`Transactions with missing coordinates: ${transactionsWithoutCoords}`);
    console.log('='.repeat(80));
    console.log();

    // Show transactions with missing segments
    if (transactionsWithMissingSegments > 0) {
      console.log('TRANSACTIONS WITH MISSING SEGMENTS:');
      console.log('-'.repeat(80));
      results
        .filter(r => r.missingSegments.length > 0)
        .slice(0, 20) // Show first 20
        .forEach(result => {
          console.log(`\nTransaction ID: ${result.transactionId}`);
          console.log(`Date: ${result.date}`);
          console.log(`Expected segments: ${result.expectedSegments.length}`);
          console.log(`Cached: ${result.cachedSegments}`);
          console.log(`Missing: ${result.missingSegments.length}`);
          console.log(`Issues: ${result.issues.join(', ')}`);
          if (result.missingSegments.length > 0) {
            console.log('Missing segments:');
            result.missingSegments.forEach((seg, idx) => {
              console.log(`  ${idx + 1}. ${seg.type}: (${seg.fromLat}, ${seg.fromLon}) -> (${seg.toLat}, ${seg.toLon})`);
            });
          }
        });

      if (transactionsWithMissingSegments > 20) {
        console.log(`\n... and ${transactionsWithMissingSegments - 20} more transactions with missing segments`);
      }
    }

    // Show transactions without coordinates
    const noCoordsResults = results.filter(r => 
      r.issues.some(issue => issue.includes('missing') && issue.includes('coordinates'))
    );
    if (noCoordsResults.length > 0) {
      console.log('\n\nTRANSACTIONS WITH MISSING COORDINATES:');
      console.log('-'.repeat(80));
      noCoordsResults.slice(0, 10).forEach(result => {
        console.log(`Transaction ID: ${result.transactionId}, Date: ${result.date}`);
        console.log(`  Issues: ${result.issues.join(', ')}`);
      });
      if (noCoordsResults.length > 10) {
        console.log(`\n... and ${noCoordsResults.length - 10} more transactions with missing coordinates`);
      }
    }

    // Show transactions with no segments
    const noSegmentsResults = results.filter(r => r.expectedSegments.length === 0 && r.hasLinkedOrders);
    if (noSegmentsResults.length > 0) {
      console.log('\n\nTRANSACTIONS WITH LINKED ORDERS BUT NO SEGMENTS:');
      console.log('-'.repeat(80));
      noSegmentsResults.slice(0, 10).forEach(result => {
        console.log(`Transaction ID: ${result.transactionId}, Date: ${result.date}`);
        console.log(`  Issues: ${result.issues.join(', ')}`);
      });
      if (noSegmentsResults.length > 10) {
        console.log(`\n... and ${noSegmentsResults.length - 10} more transactions`);
      }
    }

    console.log('\n\nDiagnostic complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error running diagnostic:', error);
    process.exit(1);
  }
}

main();

