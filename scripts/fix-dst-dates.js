#!/usr/bin/env node
/**
 * Fix DST-related date issues for March 10-11, 2026
 * Shifts transactions and orders that were incorrectly stored on March 11
 * back to March 10 (subtracts 1 hour from timestamps)
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI env var required'); process.exit(1); }

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // March 11 EDT range (the day where misplaced orders ended up)
  // These orders have evening times (6-10 PM) which means they were from March 10
  const mar11Start = new Date('2026-03-11T04:00:00.000Z'); // March 11 00:00 EDT
  const mar11End = new Date('2026-03-12T04:00:00.000Z');   // March 12 00:00 EDT
  
  // One hour shift to correct DST offset
  const ONE_HOUR_MS = 60 * 60 * 1000;

  console.log('Looking for transactions on March 11 that should be March 10...\n');

  // Find transactions on March 11 with evening times (these are the misplaced ones)
  const txns = await db.collection('transactions').find({
    type: 'income',
    date: { $gte: mar11Start, $lt: mar11End }
  }).toArray();

  console.log(`Found ${txns.length} transactions on March 11:`);
  
  let txnFixCount = 0;
  for (const t of txns) {
    // Check if time is evening (after 5 PM = 17:00)
    const timeStr = t.time || '';
    const hour = parseInt(timeStr.split(':')[0] || '0');
    
    if (hour >= 17 || hour < 5) { // Evening or late night
      console.log(`  - ${t.time} | $${t.amount} | ${t.tag} | ${t.notes || ''}`);
      
      // Shift date back by 1 hour
      const oldDate = new Date(t.date);
      const newDate = new Date(oldDate.getTime() - ONE_HOUR_MS);
      
      await db.collection('transactions').updateOne(
        { _id: t._id },
        { $set: { date: newDate } }
      );
      txnFixCount++;
    }
  }
  
  console.log(`\nFixed ${txnFixCount} transactions.\n`);

  // Now fix delivery orders
  console.log('Looking for delivery orders on March 11 that should be March 10...\n');
  
  const orders = await db.collection('deliveryorders').find({
    processedAt: { $gte: mar11Start, $lt: mar11End }
  }).toArray();

  console.log(`Found ${orders.length} delivery orders on March 11:`);
  
  let orderFixCount = 0;
  for (const o of orders) {
    console.log(`  - ${o.restaurantName} | $${o.money} | ${o.appName}`);
    
    // Shift processedAt and createdAt back by 1 hour
    const updates = {};
    
    if (o.processedAt) {
      updates.processedAt = new Date(new Date(o.processedAt).getTime() - ONE_HOUR_MS);
    }
    if (o.createdAt) {
      updates.createdAt = new Date(new Date(o.createdAt).getTime() - ONE_HOUR_MS);
    }
    
    if (Object.keys(updates).length > 0) {
      await db.collection('deliveryorders').updateOne(
        { _id: o._id },
        { $set: updates }
      );
      orderFixCount++;
    }
  }
  
  console.log(`\nFixed ${orderFixCount} delivery orders.\n`);
  
  // Verify the fix
  console.log('Verifying fix...\n');
  
  const mar10Txns = await db.collection('transactions').find({
    type: 'income',
    date: { 
      $gte: new Date('2026-03-10T04:00:00.000Z'),
      $lt: new Date('2026-03-11T04:00:00.000Z')
    }
  }).toArray();
  
  const mar10Total = mar10Txns.reduce((sum, t) => sum + (t.amount || 0), 0);
  console.log(`March 10 now has ${mar10Txns.length} transactions totaling $${mar10Total.toFixed(2)}`);
  
  await mongoose.disconnect();
  console.log('\nDone!');
}

run().catch(e => { console.error(e.message); process.exit(1); });
