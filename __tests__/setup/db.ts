import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer: MongoMemoryServer | null = null;

export async function setupTestDB() {
  // Clean up any existing connection first
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close();
      // Wait a bit for connection to fully close
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  
  // Stop any existing server
  if (mongoServer) {
    try {
      await mongoServer.stop();
      // Wait a bit for server to fully stop
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Ignore errors if server is already stopped
    }
    mongoServer = null;
  }
  
  // Create new server with automatic port selection
  mongoServer = await MongoMemoryServer.create({
    instance: {
      port: undefined, // Let it auto-select an available port
    },
  });
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  return mongoUri;
}

export async function teardownTestDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      // Wait a bit for connection to fully close
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
  
  if (mongoServer) {
    try {
      await mongoServer.stop();
      // Wait a bit for server to fully stop
      await new Promise(resolve => setTimeout(resolve, 100));
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

