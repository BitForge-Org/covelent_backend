import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { generalLimiter, authLimiter } from "./utils/rateLimiter.js"; // 👈 import utility

const app = express();

// Serve static files from the public directory
app.use(express.static(path.resolve("public")));

// Serve the logs directory as static (for log file access)
app.use("/logs", express.static(path.resolve("public/logs")));

app.use(generalLimiter); // 👈 use rate limiter middleware

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

import userRouter from "./routes/user.routes.js";
import healthcheckRouter from "./routes/healthcheck.routes.js";

app.use("/api/v1/users", authLimiter, userRouter); // 👈 apply authLimiter to user routes
app.use("/api/v1/healthcheck", healthcheckRouter);

// Serve the health chart at a custom route
app.get("/health/memory-chart", (req, res) => {
  res.sendFile(path.resolve("public/health-heapused-chart.html"));
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Example route usage (add your routes here)
// app.use("/api/health", healthcheckRouter);

export { app };
