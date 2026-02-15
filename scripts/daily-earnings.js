#!/usr/bin/env node
/**
 * Daily earnings script — fetches today's transactions + delivery orders with OCR text.
 * Only counts orders as "complete" if they have a linkedTransactionId.
 * 
 * Usage: node scripts/daily-earnings.js [YYYY-MM-DD]
 * Defaults to today (EST).
 * 
 * Output: JSON with hourly breakdown, totals, and raw OCR text for LLM parsing.
 */

const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI env var required'); process.exit(1); }

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // Parse date arg or use today (EST)
  const now = new Date();
  const estOffset = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dateArg = process.argv[2];
  
  let year, month, day;
  if (dateArg) {
    [year, month, day] = dateArg.split('-').map(Number);
  } else {
    year = estOffset.getFullYear();
    month = estOffset.getMonth() + 1;
    day = estOffset.getDate();
  }

  // Build UTC range for the EST day
  const startEST = new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00-05:00`);
  const endEST = new Date(startEST.getTime() + 24 * 60 * 60 * 1000);

  // Fetch transactions
  const txns = await db.collection('transactions').find({
    type: 'income',
    date: { $gte: startEST, $lt: endEST }
  }).sort({ date: 1 }).toArray();

  // Fetch delivery orders
  const orders = await db.collection('deliveryorders').find({
    createdAt: { $gte: startEST, $lt: endEST }
  }).sort({ createdAt: 1 }).toArray();

  // Build transaction lookup by ID
  const txnById = {};
  txns.forEach(t => { txnById[t._id.toString()] = t; });

  // Build order lookup by linked transaction
  const orderByTxnId = {};
  orders.forEach(o => {
    (o.linkedTransactionIds || []).forEach(tid => {
      orderByTxnId[tid.toString()] = o;
    });
  });

  // Hourly buckets based on transaction acceptance time
  const hourly = {};
  let total = 0, uber = 0, dash = 0, grubhub = 0, other = 0;
  let firstTime = null;

  const completedOrders = [];

  txns.forEach(t => {
    const amount = t.amount;
    total += amount;
    
    const source = (t.tag || '') + ' ' + (t.notes || '');
    if (source.includes('Uber')) uber += amount;
    else if (source.includes('Dash')) dash += amount;
    else if (source.includes('GH') || source.includes('Grub')) grubhub += amount;
    else other += amount;

    // Hour bucket from acceptance time
    const h = t.time ? parseInt(t.time.split(':')[0]) : null;
    if (h !== null) {
      const label = h >= 12 ? (h === 12 ? '12 PM' : (h - 12) + ' PM') : (h === 0 ? '12 AM' : h + ' AM');
      if (!hourly[label]) hourly[label] = { amount: 0, count: 0, hour: h };
      hourly[label].amount += amount;
      hourly[label].count++;
      if (!firstTime) firstTime = t.time;
    }

    // Find linked delivery order
    const order = orderByTxnId[t._id.toString()];
    completedOrders.push({
      amount,
      platform: t.tag || 'Unknown',
      acceptedAt: t.time,
      restaurant: order ? order.restaurantName : null,
      miles: order ? order.miles : null,
      ocrText: order?.metadata?.ocrText || null,
      hasOrder: !!order,
    });
  });

  // Sort hourly
  const sortedHourly = Object.entries(hourly)
    .sort((a, b) => a[1].hour - b[1].hour)
    .map(([label, data]) => ({
      hour: label,
      amount: Math.round(data.amount * 100) / 100,
      deliveries: data.count,
      fire: data.amount >= 50,
    }));

  // Current hour (EST)
  const currentHour = estOffset.getHours();
  const hoursWorked = firstTime ? Math.max(currentHour - parseInt(firstTime.split(':')[0]), 1) : 0;

  const result = {
    date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    total: Math.round(total * 100) / 100,
    deliveries: txns.length,
    platforms: {
      uber: Math.round(uber * 100) / 100,
      doordash: Math.round(dash * 100) / 100,
      grubhub: Math.round(grubhub * 100) / 100,
      other: Math.round(other * 100) / 100,
    },
    hourly: sortedHourly,
    avgPerHour: hoursWorked > 0 ? Math.round((total / hoursWorked) * 100) / 100 : 0,
    firstDelivery: firstTime,
    hoursWorked,
    orders: completedOrders,
    ordersWithOcr: completedOrders.filter(o => o.ocrText).length,
    ordersLinked: completedOrders.filter(o => o.hasOrder).length,
  };

  console.log(JSON.stringify(result));
  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
