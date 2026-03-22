import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import { xss } from "express-xss-sanitizer";
import { config } from "./config/env.js";
import { logger, morganStream } from "./utils/logger.js";
import { isCloudinaryEnabled } from "./config/cloudinary.js";

/**
 * Create Express application
 */
const app = express();

// Serve local uploads in development when Cloudinary isn't configured
(() => {
  const flag = String(process.env.ENABLE_LOCAL_UPLOADS ?? "").toLowerCase();
  const localEnabled =
    flag === "true" ||
    flag === "1" ||
    flag === "yes" ||
    (config.env === "development" && !isCloudinaryEnabled());
  if (!localEnabled) return;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serverRoot = path.resolve(__dirname, "..");
  const uploadsDir = path.resolve(serverRoot, "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  app.use("/uploads", express.static(uploadsDir));
  logger.warn(`⚠️  Serving local uploads from /uploads (${uploadsDir})`);
})();

/**
 * Security Middleware
 */
// Helmet - Set security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS - Enable Cross-Origin Resource Sharing
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 600, // Cache preflight request for 10 minutes
  }),
);

// Handle preflight requests explicitly
app.options("*", cors());

// Avoid noisy 404s from browser favicon requests
app.get("/favicon.ico", (req, res) => res.status(204).end());

// MongoDB Sanitize - Prevent NoSQL injection
app.use(mongoSanitize());

// XSS Protection - Prevent Cross-Site Scripting attacks
app.use(xss());

/**
 * Rate limiting
 * Helps prevent request bursts (including client retry loops) from exhausting Firestore quotas.
 */
const windowMs = process.env.RATE_LIMIT_WINDOW_MS
  ? Number(process.env.RATE_LIMIT_WINDOW_MS)
  : Number(process.env.RATE_LIMIT_WINDOW || 1) * 60_000;

const maxRequests = Number(
  process.env.RATE_LIMIT_MAX || process.env.RATE_LIMIT_MAX_REQUESTS || 120,
);

const apiLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests. Please slow down and try again.",
  },
});

app.use("/api", apiLimiter);

/**
 * Body Parsing Middleware
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/**
 * Compression Middleware
 */
app.use(compression());

/**
 * Logging Middleware
 */
if (config.env === "development") {
  app.use(morgan("dev", { stream: morganStream }));
} else {
  app.use(morgan("combined", { stream: morganStream }));
}

/**
 * Health Check Endpoint
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

/**
 * Root Endpoint
 */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "KMJ Billing System API",
    version: config.apiVersion,
    status: "running",
    endpoints: {
      health: "/health",
      api: `/api/${config.apiVersion}`,
      documentation: `/api/${config.apiVersion}/docs`,
    },
  });
});

/**
 * API Base Route
 */
app.get(`/api/${config.apiVersion}`, (req, res) => {
  res.status(200).json({
    success: true,
    message: "KMJ Billing System API",
    version: config.apiVersion,
    documentation: "/api/v1/docs",
  });
});

/**
 * API Routes
 */
import routes from "./routes/index.js";
import {
  requestLogger,
  notFound,
  errorHandler,
} from "./middleware/errorHandler.js";

// Request logging middleware
app.use(requestLogger);

// Mount API routes
app.use("/api", routes);

/**
 * 404 Handler - Route not found
 */
app.use(notFound);

/**
 * Global Error Handler
 */
app.use(errorHandler);

export default app;
