import { createClient } from 'redis';
import logger from './logger.js';

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff, max 30s
      return Math.min(retries * 100, 30000);
    },
    connectTimeout: 10000,
  },
  logger: {
    isEnabled: true,
    level: 'info',
    log: (level, message) => {
      logger.log(level, 'Redis Client:', message);
    },
  },
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('end', () => {
  logger.warn('Redis client connection closed.');
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
