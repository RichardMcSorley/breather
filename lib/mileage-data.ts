import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import connectDB from "@/lib/mongodb";
import Mileage from "@/lib/models/Mileage";
import UserSettings from "@/lib/models/UserSettings";
import TeslaConnection from "@/lib/models/TeslaConnection";
import { parseDateOnlyAsUTC, formatDateAsUTC } from "@/lib/date-utils";
import { validatePagination } from "@/lib/validation";
import { MileageQuery } from "@/lib/types";

/**
 * Server-side data fetching functions for mileage page
 */

export async function getMileageEntries(page: number = 1, limit: number = 50) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const pagination = validatePagination(page.toString(), limit.toString());
  if (!pagination) {
    throw new Error("Invalid pagination parameters");
  }
  const { page: validPage, limit: validLimit } = pagination;

  const query: MileageQuery = { userId: session.user.id };

  const [entries, total] = await Promise.all([
    Mileage.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit)
      .lean(),
    Mileage.countDocuments(query),
  ]);

  const formattedEntries = entries.map((entry: any) => ({
    ...entry,
    _id: entry._id.toString(),
    date: formatDateAsUTC(new Date(entry.date)),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return {
    entries: formattedEntries,
    pagination: {
      page: validPage,
      limit: validLimit,
      total,
      totalPages: Math.ceil(total / validLimit),
    },
  };
}

export async function getAllMileageEntries() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const entries = await Mileage.find({ userId: session.user.id })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  return {
    entries: entries.map((entry: any) => ({
      ...entry,
      _id: entry._id.toString(),
      date: formatDateAsUTC(new Date(entry.date)),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}

export async function getSettings() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  let settings = await UserSettings.findOne({ userId: session.user.id }).lean();

  if (!settings) {
    const newSettings = await UserSettings.create({
      userId: session.user.id,
      irsMileageDeduction: 0.70,
    });
    return newSettings.toObject();
  } else {
    if (settings.irsMileageDeduction === undefined || settings.irsMileageDeduction === null) {
      settings.irsMileageDeduction = 0.70;
    }
    if (settings.incomeSourceTags === undefined || settings.incomeSourceTags === null) {
      settings.incomeSourceTags = [];
    } else if (!Array.isArray(settings.incomeSourceTags)) {
      settings.incomeSourceTags = [];
    }
    if (settings.expenseSourceTags === undefined || settings.expenseSourceTags === null) {
      settings.expenseSourceTags = [];
    } else if (!Array.isArray(settings.expenseSourceTags)) {
      settings.expenseSourceTags = [];
    }
    if (settings.cars === undefined || settings.cars === null) {
      settings.cars = [];
    } else if (!Array.isArray(settings.cars)) {
      settings.cars = [];
    }
    return settings;
  }
}

export async function getTeslaConnection() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await connectDB();

  const connection = await TeslaConnection.findOne({ userId: session.user.id }).lean();

  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    vehicleName: connection.vehicleName,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() || null,
  };
}
