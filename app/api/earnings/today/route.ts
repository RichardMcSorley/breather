import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = 'force-dynamic';

// Localhost-only endpoint for cron jobs
export async function GET(request: NextRequest) {
  // Only allow localhost requests
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1';
  
  if (!['127.0.0.1', '::1', 'localhost'].includes(ip) && !ip.startsWith('192.168.')) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    
    // Get date from query or use today EST
    const { searchParams } = new URL(request.url);
    const dateArg = searchParams.get('date');
    
    const now = new Date();
    const estOffset = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    let year: number, month: number, day: number;
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

    // Build hourly buckets and totals
    const hourly: Record<string, { amount: number; count: number; hour: number }> = {};
    let total = 0, uber = 0, dash = 0, grubhub = 0, other = 0;
    let firstTime: string | null = null;

    txns.forEach((t: any) => {
      const amount = t.amount || 0;
      total += amount;
      
      const source = (t.tag || '') + ' ' + (t.notes || '');
      if (source.includes('Uber')) uber += amount;
      else if (source.includes('Dash')) dash += amount;
      else if (source.includes('GH') || source.includes('Grub')) grubhub += amount;
      else other += amount;

      const h = t.time ? parseInt(t.time.split(':')[0]) : null;
      if (h !== null) {
        const label = h >= 12 ? (h === 12 ? '12 PM' : (h - 12) + ' PM') : (h === 0 ? '12 AM' : h + ' AM');
        if (!hourly[label]) hourly[label] = { amount: 0, count: 0, hour: h };
        hourly[label].amount += amount;
        hourly[label].count++;
        if (!firstTime) firstTime = t.time;
      }
    });

    const sortedHourly = Object.entries(hourly)
      .sort((a, b) => a[1].hour - b[1].hour)
      .map(([label, data]) => ({
        hour: label,
        amount: Math.round(data.amount * 100) / 100,
        deliveries: data.count,
        fire: data.amount >= 50,
      }));

    const currentHour = estOffset.getHours();
    const hoursWorked = firstTime ? Math.max(currentHour - parseInt(firstTime.split(':')[0]), 1) : 0;

    return NextResponse.json({
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
