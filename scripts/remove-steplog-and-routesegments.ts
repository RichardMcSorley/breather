#!/usr/bin/env tsx

/**
 * Migration script to remove stepLog and routeSegments from all Transaction documents
 * 
 * This script:
 * 1. Connects to the database
 * 2. Removes all stepLog arrays from all Transaction documents
 * 3. Removes all routeSegments arrays from all Transaction documents
 * 4. Optionally drops the DistanceMatrixCache collection
 */

// CRITICAL: Load environment variables BEFORE any other imports
const dotenv = require("dotenv");
const { resolve } = require("path");

// Load .env.local if it exists, otherwise fall back to .env
const envLocalPath = resolve(process.cwd(), ".env.local");
const envPath = resolve(process.cwd(), ".env");
dotenv.config({ path: envLocalPath });
dotenv.config({ path: envPath });

// Now we can safely import modules that depend on environment variables
import connectDB from "../lib/mongodb";
import Transaction from "../lib/models/Transaction";
import mongoose from "mongoose";

async function main() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Connected to database\n');

    // Remove stepLog and routeSegments from all transactions
    console.log('Removing stepLog and routeSegments from all transactions...');
    const result = await Transaction.updateMany(
      {},
      {
        $unset: {
          stepLog: "",
          routeSegments: ""
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} transactions\n`);

    // Optionally drop DistanceMatrixCache collection
    console.log('Dropping DistanceMatrixCache collection...');
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }
      await db.collection('distancematrixcaches').drop();
      console.log('DistanceMatrixCache collection dropped successfully\n');
    } catch (error: any) {
      if (error.codeName === 'NamespaceNotFound') {
        console.log('DistanceMatrixCache collection does not exist (already dropped or never created)\n');
      } else {
        console.error('Error dropping DistanceMatrixCache collection:', error);
      }
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  }
}

main();
