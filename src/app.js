import session from 'express-session';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import lusca from 'lusca';
const { csrf } = lusca;

import { generalLimiter, authLimiter } from './utils/rateLimiter.js';
import { setupSwagger } from './swagger.js';

const app = express();

// Logger middleware
app.use(apiLoggerMiddleware);

// Serve static files from the public directory
app.use(express.static(path.resolve('public')));

// Serve the logs directory as static (for log file access)
// app.use("/logs", express.static(path.resolve("public/logs")));

app.use(generalLimiter); // 👈 use rate limiter middleware

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

app.use(cookieParser());

// Session middleware (required for lusca)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);
// CSRF token endpoint for frontend
app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
// app.use(csrf());

import userRouter from './routes/user.routes.js';
import healthcheckRouter from './routes/healthcheck.routes.js';
import categoryRouter from './routes/category.routes.js';
import serviceRoutes from './routes/service.routes.js';
import authRouter from './routes/auth.routes.js';
import apiLoggerMiddleware from './middlewares/apiLogger.middleware.js';
import providerApplicationRouter from './routes/provider-application.routes.js';
import BookingRouter from './routes/booking.routes.js';
import AddressRouter from './routes/address.routers.js';
import adminRouter from './routes/admin.routes.js';
app.use('/api/v1/admin', authLimiter, adminRouter); // 👈 apply authLimiter to admin routes

app.use('/api/v1/users', authLimiter, userRouter); // 👈 apply authLimiter to user routes
app.use('/api/v1/auth', authLimiter, authRouter); // 👈 apply authLimiter to auth routes
app.use('/api/v1/healthcheck', healthcheckRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/provider-applications', providerApplicationRouter);
app.use('/api/v1/bookings', BookingRouter);
app.use('/api/v1/addresses', AddressRouter);

setupSwagger(app);

// Serve the health chart at a custom route
// app.use("/health/memory-chart", (req, res) => {
//   res.sendFile(path.resolve("public/health-heapused-chart.html"));
// });

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || [],
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Example route usage (add your routes here)
// app.use("/api/health", healthcheckRouter);

export { app };
