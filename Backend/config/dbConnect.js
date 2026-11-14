import mongoose from "mongoose";
import dns from "node:dns";

if (!process.env.VERCEL) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  } catch (e) {
    console.warn("DNS server override notice:", e.message);
  }
}

let cachedPromise = null;

// Ensure event listeners clear any dead/stuck cached promises
mongoose.connection.on("disconnected", () => {
  cachedPromise = null;
  console.warn("[MongoDB] Connection disconnected. Cached promise cleared.");
});

mongoose.connection.on("error", (err) => {
  cachedPromise = null;
  console.error("[MongoDB] Connection error event:", err.message);
});

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const errorMsg = "MONGODB_URI is not set in environment variables!";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    })
    .then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn.connection;
    })
    .catch((error) => {
      cachedPromise = null; // Reset promise so subsequent requests can retry
      console.error("MongoDB connection error:", error.message);
      throw error;
    });

  return cachedPromise;
};

export default connectDB;