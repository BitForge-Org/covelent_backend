import { createClient } from "redis";

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff, max 30s
      return Math.min(retries * 100, 30000);
    },
    connectTimeout: 10000,
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

redisClient.on("end", () => {
  console.warn("Redis client connection closed.");
});

// Call this during app startup
export async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

// Graceful shutdown
export async function closeRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}
