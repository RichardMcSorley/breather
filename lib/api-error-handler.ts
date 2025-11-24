import { NextResponse } from "next/server";

export function handleApiError(error: any): NextResponse {
  console.error("API Error:", error);
  
  // MongoDB connection errors
  if (
    error.message?.includes("ECONNREFUSED") ||
    error.message?.includes("MongoDB") ||
    error.message?.includes("MongooseServerSelectionError") ||
    error.name === "MongooseServerSelectionError"
  ) {
    return NextResponse.json(
      {
        error: "Database connection failed. Please check your MongoDB connection.",
        details:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
        hint:
          process.env.NODE_ENV === "development"
            ? "Make sure MongoDB is running: mongod or brew services start mongodb-community"
            : undefined,
      },
      { status: 503 }
    );
  }

  // Validation errors
  if (error.name === "ValidationError") {
    return NextResponse.json(
      { error: "Validation error", details: error.message },
      { status: 400 }
    );
  }

  // Generic error
  return NextResponse.json(
    {
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    },
    { status: 500 }
  );
}


