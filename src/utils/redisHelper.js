import { redisClient } from './redisClient.js';
import logger from './logger.js';

/**
 * Safely executes a Redis command with fallback logic.
 * If Redis is unavailable or fails, it catches the error and returns null,
 * allowing the application to proceed without caching.
 * 
 * @param {Function} operation - Async function performing data fetching
 * @param {Function} redisOperation - Async function performing redis operation (get/set)
 * @returns {Promise<any>} - Result of the operation
 */
export const withRedisFallback = async (redisFn, fallbackValue = null) => {
  try {
    if (!redisClient.isOpen) {
      return fallbackValue;
    }
    return await redisFn();
  } catch (error) {
    logger.error(`Redis Error (Fallback triggered): ${error.message}`);
    return fallbackValue;
  }
};
