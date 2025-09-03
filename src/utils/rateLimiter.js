/**
 * General-purpose rate limiter middleware for Express.
 * Limits each IP to 30 requests per 15 minutes.
 *
 * @type {import("express-rate-limit").RateLimitRequestHandler}
 */

/**
 * Authentication-specific rate limiter middleware for Express.
 * Limits each IP to 10 requests per 10 minutes.
 *
 * @type {import("express-rate-limit").RateLimitRequestHandler}
 */
// utils/rateLimiter.js
import rateLimit from 'express-rate-limit';
import logger from './logger.js';

// Check if rate limiter should be disabled via .env
const rateLimiterOff = process.env.RATE_LIMITER_OFF === 'true';

// No-op middleware
const noop = (req, res, next) => next();

// General-purpose rate limiter (e.g., 100 requests per 15 minutes)
export const generalLimiter = rateLimiterOff
  ? noop
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, next, options) => {
        logger.warn(
          `[RateLimiter] General limiter triggered for IP: ${req.ip} at ${new Date().toISOString()}`
        );
        res.status(options.statusCode).json({ message: options.message });
      },
    });

// Authentication-specific rate limiter
export const authLimiter = rateLimiterOff
  ? noop
  : rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 20,
      message: 'Too many login attempts. Try again in 10 minutes.',
      handler: (req, res, next, options) => {
        logger.warn(
          `[RateLimiter] Auth limiter triggered for IP: ${req.ip} at ${new Date().toISOString()}`
        );
        res.status(options.statusCode).json({ message: options.message });
      },
    });
