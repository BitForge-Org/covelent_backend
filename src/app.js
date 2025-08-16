import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { generalLimiter, authLimiter } from "./utils/rateLimiter.js"; // 👈 import utility
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const app = express();

// Serve static files from the public directory
app.use(express.static(path.resolve("public")));

// Serve the logs directory as static (for log file access)
// app.use("/logs", express.static(path.resolve("public/logs")));

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
import categoryRouter from "./routes/category.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import authRouter from "./routes/auth.routes.js";

app.use("/api/v1/users", authLimiter, userRouter); // 👈 apply authLimiter to user routes
app.use("/api/v1/auth", authLimiter, authRouter); // 👈 apply authLimiter to auth routes
app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/services", serviceRoutes);

// Swagger definition
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Covelent Backend API",
    version: "1.0.0",
    description: "API documentation for Covelent Backend",
  },
  servers: [
    {
      url: "http://localhost:8000",
      description: "Local server",
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ["./src/routes/*.js", "./src/controllers/*.js", "./src/models/*.js"], // Scan all route, controller, and model files
};

const swaggerSpec = swaggerJsdoc(options);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Serve the health chart at a custom route
// app.use("/health/memory-chart", (req, res) => {
//   res.sendFile(path.resolve("public/health-heapused-chart.html"));
// });

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
