import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer: MongoMemoryServer | null = null;

export async function setupTestDB() {
  // Clean up any existing connection first
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  // Stop any existing server
  if (mongoServer) {
    try {
      await mongoServer.stop();
    } catch (error) {
      // Ignore errors if server is already stopped
    }
    mongoServer = null;
  }
  
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  return mongoUri;
}

export async function teardownTestDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
  
  if (mongoServer) {
    try {
      await mongoServer.stop();
      mongoServer = null;
    } catch (error) {
      // Ignore errors if server is already stopped
      mongoServer = null;
    }
  }
}

export async function clearDatabase() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

