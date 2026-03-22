/**
 * Environment Configuration
 * Loads and validates environment variables
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
// Prefer server root `.env` regardless of where node was invoked from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..", "..");

const envPath = path.resolve(serverRoot, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Fallback: default dotenv behavior (looks in process.cwd())
  dotenv.config();
}

/**
 * Validate required environment variables
 */
const requiredEnvVars = ["JWT_SECRET", "JWT_EXPIRE"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach((varName) => console.error(`   - ${varName}`));
  console.error("\n💡 Please check your server .env file");
  console.error(`   Expected: ${envPath}`);
  process.exit(1);
}

/**
 * Environment configuration object
 */
export const config = {
  // Server
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT) || 5000,
  apiVersion: process.env.API_VERSION || "v1",

  // CORS
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
      : [
          "http://localhost:5173",
          "http://localhost:3000",
          "https://kmj-billing-system.vercel.app",
          "http://kmjinfo.com",
          "https://kmjinfo.com",
          "http://www.kmjinfo.com",
          "https://www.kmjinfo.com",
        ],
    credentials: true,
  },
};

export default config;
