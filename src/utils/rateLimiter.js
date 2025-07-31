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
import rateLimit from "express-rate-limit";

// General-purpose rate limiter (e.g., 100 requests per 15 minutes)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// You can define others, too
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100000,
  message: "Too many login attempts. Try again in 10 minutes.",
});
