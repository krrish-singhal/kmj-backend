/**
 * Portal Routes
 * User Portal (Mahal member login) + Jamat Portal (multi-tenant)
 */

import express from "express";
import jwt from "jsonwebtoken";
import { verifyToken, authorize } from "../middleware/auth.js";
import {
  // User portal
  userPortalLogin,
  getUserPortalFamily,
  // Jamat management (admin)
  createJamatPortal,
  listJamatPortals,
  deleteJamatPortal,
  updateJamatCredentials,
  // Jamat auth (public)
  checkJamatExists,
  jamatPortalLogin,
  jamatForgotPassword,
  // Jamat data (authenticated jamat session)
  getJamatModuleData,
  addJamatModuleItem,
  updateJamatModuleItem,
  deleteJamatModuleItem,
  getJamatSettings,
  updateJamatSettings,
  // Custom field schemas
  getModuleSchema,
  saveModuleSchema,
  // Full DB export / migration
  exportJamatDatabase,
} from "../controllers/portalController.js";

const router = express.Router();

// ─── Middleware: verify User Portal JWT ────────────────────────────────────
const verifyUserPortalToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided." });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (decoded.type !== "user_portal") {
      return res
        .status(403)
        .json({ success: false, message: "Invalid token type." });
    }
    req.portalUser = decoded;
    next();
  } catch {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// ─── Middleware: verify Jamat Portal JWT ───────────────────────────────────
const verifyJamatPortalToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided." });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (decoded.type !== "jamat_portal") {
      return res
        .status(403)
        .json({ success: false, message: "Invalid token type." });
    }
    req.jamatUser = decoded;
    next();
  } catch {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// USER PORTAL ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/v1/portal/user/login
router.post("/user/login", userPortalLogin);

// GET /api/v1/portal/user/family  (protected)
router.get("/user/family", verifyUserPortalToken, getUserPortalFamily);

// ════════════════════════════════════════════════════════════════════════════
// JAMAT PORTAL ADMIN ROUTES (requires main app admin auth)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/v1/portal/jamat  — create portal
router.post("/jamat", verifyToken, authorize("admin"), createJamatPortal);

// GET /api/v1/portal/jamat   — list all portals
router.get("/jamat", verifyToken, authorize("admin"), listJamatPortals);

// DELETE /api/v1/portal/jamat/:slug
router.delete(
  "/jamat/:slug",
  verifyToken,
  authorize("admin"),
  deleteJamatPortal,
);

// PUT /api/v1/portal/jamat/:slug/credentials  (admin reset)
router.put(
  "/jamat/:slug/credentials",
  verifyToken,
  authorize("admin"),
  updateJamatCredentials,
);

// ════════════════════════════════════════════════════════════════════════════
// JAMAT PORTAL PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/v1/portal/jamat/:slug/exists
router.get("/jamat/:slug/exists", checkJamatExists);

// POST /api/v1/portal/jamat/:slug/login
router.post("/jamat/:slug/login", jamatPortalLogin);

// PUT /api/v1/portal/jamat/:slug/forgot-password
router.put("/jamat/:slug/forgot-password", jamatForgotPassword);

// ════════════════════════════════════════════════════════════════════════════
// JAMAT PORTAL DATA ROUTES (requires jamat portal JWT)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/v1/portal/jamat/:slug/settings
router.get("/jamat/:slug/settings", verifyJamatPortalToken, getJamatSettings);

// PUT /api/v1/portal/jamat/:slug/settings
router.put(
  "/jamat/:slug/settings",
  verifyJamatPortalToken,
  updateJamatSettings,
);

// GET /api/v1/portal/jamat/:slug/data/:module
router.get(
  "/jamat/:slug/data/:module",
  verifyJamatPortalToken,
  getJamatModuleData,
);

// POST /api/v1/portal/jamat/:slug/data/:module
router.post(
  "/jamat/:slug/data/:module",
  verifyJamatPortalToken,
  addJamatModuleItem,
);

// PUT /api/v1/portal/jamat/:slug/data/:module/:itemId
router.put(
  "/jamat/:slug/data/:module/:itemId",
  verifyJamatPortalToken,
  updateJamatModuleItem,
);

// DELETE /api/v1/portal/jamat/:slug/data/:module/:itemId
router.delete(
  "/jamat/:slug/data/:module/:itemId",
  verifyJamatPortalToken,
  deleteJamatModuleItem,
);

// ════════════════════════════════════════════════════════════════════════════
// CUSTOM FIELD SCHEMA ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/v1/portal/jamat/:slug/schema/:module
router.get(
  "/jamat/:slug/schema/:module",
  verifyJamatPortalToken,
  getModuleSchema,
);

// PUT /api/v1/portal/jamat/:slug/schema/:module
router.put(
  "/jamat/:slug/schema/:module",
  verifyJamatPortalToken,
  saveModuleSchema,
);

// ════════════════════════════════════════════════════════════════════════════
// FULL DATABASE EXPORT / MIGRATION
// ════════════════════════════════════════════════════════════════════════════

// GET /api/v1/portal/jamat/:slug/export  (jamat JWT or admin JWT)
router.get(
  "/jamat/:slug/export",
  (req, res, next) => {
    // Accept either a jamat portal token or an admin token
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token." });
    }
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      if (decoded.type === "jamat_portal") {
        req.jamatUser = decoded;
      } else if (decoded.role === "admin" || decoded.type === "admin") {
        req.user = decoded;
      } else {
        return res.status(403).json({ success: false, message: "Forbidden." });
      }
      next();
    } catch {
      res.status(401).json({ success: false, message: "Invalid token." });
    }
  },
  exportJamatDatabase,
);

export default router;
