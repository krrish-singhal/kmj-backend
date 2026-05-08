/**
 * Portal Controller
 * Handles User Portal (Mahal login) and Jamat Portal (multi-tenant) operations
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getFirestore } from "../config/firebase.js";
import Member from "../models/Member.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { createTtlCache } from "../utils/ttlCache.js";

// ─── Firestore collection names ────────────────────────────────────────────
const JAMAT_PORTALS_COLLECTION = "jamat_portals";

// ─── Caches ───────────────────────────────────────────────────────────────
// Household data is read-only for the portal; 60 s is safe.
const familyCache = createTtlCache(60_000);
// Jamat portal list changes rarely; cache for 30 s.
const jamatPortalsCache = createTtlCache(30_000);
// Slug existence checks — portals are rarely deleted or created; 5 min TTL is fine.
const slugExistsCache = createTtlCache(5 * 60_000);
// Per-portal module data — short TTL (20 s) so mutations invalidate quickly.
const moduleDataCache = createTtlCache(20_000);

// ─── Token helpers ─────────────────────────────────────────────────────────
const generatePortalToken = (payload, expiresIn = "8h") =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// ─── Allowed modules ───────────────────────────────────────────────────────
export const ALLOWED_MODULES = [
  "notices",
  "contacts",
  "inventory",
  "members",
  "vouchers",
  "lands",
  "bills",
  "reports",
];

// ════════════════════════════════════════════════════════════════════════════
// PART A: USER PORTAL (Mahal member login)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/v1/portal/user/login
 * @desc    Login with Mahal ID (username) + phone number (password)
 * @access  Public
 */
export const userPortalLogin = asyncHandler(async (req, res, next) => {
  const { mahalId, phone } = req.body;

  if (!mahalId || !phone) {
    return next(new AppError("Mahal ID and phone number are required.", 400));
  }

  const mahalIdTrimmed = String(mahalId).trim();
  const phoneTrimmed = String(phone).trim();

  // Step 1: Find all members with this Mahal ID
  const allMembers = await Member.find({
    Mid: mahalIdTrimmed,
    isActive: true,
  }).lean();

  if (!allMembers || allMembers.length === 0) {
    logger.warn(`User portal login: No user found for Mid=${mahalIdTrimmed}`);
    return next(new AppError("No user found", 401));
  }

  // Step 2: Check phone number against all members in this household
  const phoneNorm = phoneTrimmed.replace(/\D/g, "");
  const matched = allMembers.find((m) => {
    const mp = String(m.Mobile || m.Phone || m.phone || "").replace(/\D/g, "");
    return mp && mp === phoneNorm;
  });

  if (!matched) {
    logger.warn(
      `User portal login: Invalid credentials for Mid=${mahalIdTrimmed}`,
    );
    return next(new AppError("Invalid credentials", 401));
  }

  // Step 3: Verify the matched member is the house owner
  const ownerRelations = [
    "the head of the household",
    "head of household",
    "house owner",
    "owner",
  ];
  const relation = String(matched.Relation || "")
    .toLowerCase()
    .trim();
  const isOwner = ownerRelations.some((r) => relation === r);

  if (!isOwner) {
    logger.warn(
      `User portal login: Non-owner login attempt Mid=${mahalIdTrimmed} Relation=${matched.Relation}`,
    );
    return next(new AppError("Only house owners can login", 403));
  }

  // Step 4: Issue token
  const token = generatePortalToken(
    { type: "user_portal", mahalId: mahalIdTrimmed, memberId: matched._id },
    "8h",
  );

  logger.info(`User portal login success: Mid=${mahalIdTrimmed}`);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      member: {
        id: matched._id,
        name: matched.Fname,
        mahalId: matched.Mid,
        relation: matched.Relation,
        address: matched.Address,
      },
    },
  });
});

/**
 * @route   GET /api/v1/portal/user/family
 * @desc    Get all family members for the logged-in house owner
 * @access  User Portal (JWT)
 */
export const getUserPortalFamily = asyncHandler(async (req, res, next) => {
  const { mahalId } = req.portalUser;

  const cacheKey = `family:v2:${mahalId}`;
  let members = familyCache.get(cacheKey);

  if (!members) {
    members = await Member.find({ Mid: mahalId, isActive: true })
      .select("Fname Relation Mobile Gender Aadhaar Dob Mid")
      .sort({ Relation: 1 })
      .lean();
    familyCache.set(cacheKey, members);
  }

  res.status(200).json({
    success: true,
    data: { members },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PART B: JAMAT PORTAL MANAGEMENT (Admin only)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/v1/portal/jamat
 * @desc    Create a new Jamat portal
 * @access  Admin only
 */
export const createJamatPortal = asyncHandler(async (req, res, next) => {
  const { jamatName, username, password, enabledModules } = req.body;

  if (!jamatName || !username || !password) {
    return next(
      new AppError("Jamat name, username, and password are required.", 400),
    );
  }
  if (String(password).length < 6) {
    return next(new AppError("Password must be at least 6 characters.", 400));
  }
  if (!Array.isArray(enabledModules) || enabledModules.length === 0) {
    return next(new AppError("At least one module must be selected.", 400));
  }

  // Validate module names
  const invalid = enabledModules.filter((m) => !ALLOWED_MODULES.includes(m));
  if (invalid.length > 0) {
    return next(new AppError(`Invalid modules: ${invalid.join(", ")}`, 400));
  }

  // Sanitize jamatName → slug (alphanumeric + underscore only)
  const slug = String(jamatName)
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_");

  const db = getFirestore();
  const portalRef = db.collection(JAMAT_PORTALS_COLLECTION).doc(slug);
  const existing = await portalRef.get();

  if (existing.exists) {
    return next(
      new AppError(`A portal with name "${slug}" already exists.`, 409),
    );
  }

  const hashedPassword = await bcrypt.hash(String(password), 12);

  const portalData = {
    jamatName: String(jamatName).trim(),
    slug,
    credentials: {
      username: String(username).trim(),
      password: hashedPassword,
      plainPassword: String(password), // stored for admin reference only
    },
    enabledModules,
    settings: {
      theme: { primary: "#31757A", secondary: "#41A4A7" },
      hiddenModules: [],
    },
    createdAt: new Date().toISOString(),
    createdBy: req.user?.memberId || req.user?.id || "admin",
  };

  await portalRef.set(portalData);

  // Create placeholder sub-collection docs for each enabled module
  // (Firestore doesn't require explicit sub-collection creation, but we drop a metadata doc)
  const batch = db.batch();
  for (const mod of enabledModules) {
    const metaRef = portalRef.collection(mod).doc("_meta");
    batch.set(metaRef, {
      module: mod,
      createdAt: new Date().toISOString(),
      itemCount: 0,
    });
  }
  await batch.commit();

  jamatPortalsCache.del("jamat_portals_list");
  slugExistsCache.del(slug);
  logger.info(`Jamat portal created: slug=${slug} by ${req.user?.memberId}`);

  res.status(201).json({
    success: true,
    message: `Jamat portal "${slug}" created successfully`,
    data: {
      slug,
      jamatName: portalData.jamatName,
      enabledModules,
      loginUrl: `/${slug}/login`,
    },
  });
});

/**
 * @route   GET /api/v1/portal/jamat
 * @desc    List all Jamat portals
 * @access  Admin only
 */
export const listJamatPortals = asyncHandler(async (req, res, next) => {
  const CACHE_KEY = "jamat_portals_list";
  let portals = jamatPortalsCache.get(CACHE_KEY);

  if (!portals) {
    const db = getFirestore();
    const snapshot = await db
      .collection(JAMAT_PORTALS_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    portals = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        slug: doc.id,
        jamatName: d.jamatName,
        enabledModules: d.enabledModules,
        createdAt: d.createdAt,
        createdBy: d.createdBy,
        loginUrl: `/${doc.id}/login`,
        credentials: {
          username: d.credentials?.username || "",
          plainPassword: d.credentials?.plainPassword || "",
        },
      };
    });
    jamatPortalsCache.set(CACHE_KEY, portals);
  }

  res.status(200).json({ success: true, data: { portals } });
});

/**
 * @route   DELETE /api/v1/portal/jamat/:slug
 * @desc    Delete a Jamat portal
 * @access  Admin only
 */
export const deleteJamatPortal = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const db = getFirestore();
  const portalRef = db.collection(JAMAT_PORTALS_COLLECTION).doc(slug);
  const doc = await portalRef.get();

  if (!doc.exists) {
    return next(new AppError(`Portal "${slug}" not found.`, 404));
  }

  await portalRef.delete();

  jamatPortalsCache.del("jamat_portals_list");
  slugExistsCache.del(slug);
  logger.info(`Jamat portal deleted: slug=${slug} by ${req.user?.memberId}`);
  res.status(200).json({ success: true, message: `Portal "${slug}" deleted.` });
});

// ════════════════════════════════════════════════════════════════════════════
// PART C: JAMAT PORTAL AUTH (Public — dynamic slug)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/v1/portal/jamat/:slug/exists
 * @desc    Check if a jamat portal exists (for dynamic route resolution)
 * @access  Public
 */
export const checkJamatExists = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;

  const cached = slugExistsCache.get(slug);
  if (cached !== undefined) {
    return res.status(200).json(cached);
  }

  const db = getFirestore();
  const doc = await db.collection(JAMAT_PORTALS_COLLECTION).doc(slug).get();

  const payload = {
    success: true,
    exists: doc.exists,
    jamatName: doc.exists ? doc.data()?.jamatName : null,
  };
  slugExistsCache.set(slug, payload);

  res.status(200).json(payload);
});

/**
 * @route   POST /api/v1/portal/jamat/:slug/login
 * @desc    Login to a specific Jamat portal
 * @access  Public
 */
export const jamatPortalLogin = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new AppError("Username and password are required.", 400));
  }

  const db = getFirestore();
  const doc = await db.collection(JAMAT_PORTALS_COLLECTION).doc(slug).get();

  if (!doc.exists) {
    return next(new AppError("Portal not found.", 404));
  }

  const data = doc.data();
  const creds = data.credentials || {};

  if (String(username).trim() !== creds.username) {
    return next(new AppError("Invalid credentials", 401));
  }

  const passwordMatch = await bcrypt.compare(String(password), creds.password);
  if (!passwordMatch) {
    return next(new AppError("Invalid credentials", 401));
  }

  const token = generatePortalToken(
    {
      type: "jamat_portal",
      slug,
      jamatName: data.jamatName,
      enabledModules: data.enabledModules,
    },
    "8h",
  );

  logger.info(`Jamat portal login success: slug=${slug}`);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      slug,
      jamatName: data.jamatName,
      enabledModules: data.enabledModules,
      settings: data.settings || {},
    },
  });
});

/**
 * @route   PUT /api/v1/portal/jamat/:slug/forgot-password
 * @desc    Reset jamat portal password by username verification
 * @access  Public
 */
export const jamatForgotPassword = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { username, newPassword } = req.body;

  if (!username || !newPassword) {
    return next(new AppError("Username and new password are required.", 400));
  }
  if (String(newPassword).length < 6) {
    return next(new AppError("Password must be at least 6 characters.", 400));
  }

  const db = getFirestore();
  const portalRef = db.collection(JAMAT_PORTALS_COLLECTION).doc(slug);
  const doc = await portalRef.get();

  if (!doc.exists) {
    return next(new AppError("Portal not found.", 404));
  }

  const creds = doc.data()?.credentials || {};
  if (String(username).trim() !== creds.username) {
    return next(new AppError("Username not found", 404));
  }

  const hashed = await bcrypt.hash(String(newPassword), 12);
  await portalRef.update({
    "credentials.password": hashed,
    "credentials.plainPassword": String(newPassword),
  });

  logger.info(`Jamat portal password updated: slug=${slug}`);

  res.status(200).json({
    success: true,
    message: "Password updated successfully",
  });
});

/**
 * @route   PUT /api/v1/portal/jamat/:slug/credentials
 * @desc    Admin resets jamat portal credentials (username + password)
 * @access  Admin only
 */
export const updateJamatCredentials = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { username, newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 6) {
    return next(
      new AppError("New password must be at least 6 characters.", 400),
    );
  }

  const db = getFirestore();
  const portalRef = db.collection(JAMAT_PORTALS_COLLECTION).doc(slug);
  const doc = await portalRef.get();

  if (!doc.exists) {
    return next(new AppError("Portal not found.", 404));
  }

  const hashed = await bcrypt.hash(String(newPassword), 12);
  const updateData = {
    "credentials.password": hashed,
    "credentials.plainPassword": String(newPassword),
  };
  if (username && String(username).trim()) {
    updateData["credentials.username"] = String(username).trim();
  }

  await portalRef.update(updateData);

  jamatPortalsCache.del("jamat_portals_list");
  logger.info(`Jamat portal credentials updated by admin: slug=${slug}`);

  res.status(200).json({
    success: true,
    message: "Credentials updated.",
    data: {
      username:
        updateData["credentials.username"] || doc.data()?.credentials?.username,
      plainPassword: String(newPassword),
    },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PART D: JAMAT PORTAL DATA (Authenticated Jamat sessions)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/v1/portal/jamat/:slug/data/:module
 * @desc    Get module data for a Jamat portal (isolated sub-collection)
 * @access  Jamat Portal JWT
 */
export const getJamatModuleData = asyncHandler(async (req, res, next) => {
  const { slug, module } = req.params;
  const { jamatUser } = req;

  // Ensure the token matches the slug
  if (jamatUser.slug !== slug) {
    return next(new AppError("Access denied.", 403));
  }

  if (!jamatUser.enabledModules.includes(module)) {
    return next(
      new AppError(`Module "${module}" is not enabled for this portal.`, 403),
    );
  }

  const cacheKey = `jamat:${slug}:${module}`;
  let docs = moduleDataCache.get(cacheKey);

  if (!docs) {
    const db = getFirestore();
    const snapshot = await db
      .collection(JAMAT_PORTALS_COLLECTION)
      .doc(slug)
      .collection(module)
      .limit(200)
      .get();

    docs = snapshot.docs
      .filter((d) => d.id !== "_meta")
      .map((d) => ({ id: d.id, ...d.data() }));

    moduleDataCache.set(cacheKey, docs);
  }

  res.status(200).json({ success: true, data: { items: docs } });
});

/**
 * @route   POST /api/v1/portal/jamat/:slug/data/:module
 * @desc    Add an item to a Jamat portal module
 * @access  Jamat Portal JWT
 */
export const addJamatModuleItem = asyncHandler(async (req, res, next) => {
  const { slug, module } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) {
    return next(new AppError("Access denied.", 403));
  }
  if (!jamatUser.enabledModules.includes(module)) {
    return next(
      new AppError(`Module "${module}" is not enabled for this portal.`, 403),
    );
  }

  const db = getFirestore();
  const colRef = db
    .collection(JAMAT_PORTALS_COLLECTION)
    .doc(slug)
    .collection(module);

  const newDoc = await colRef.add({
    ...req.body,
    createdAt: new Date().toISOString(),
    _portal: slug,
  });

  moduleDataCache.del(`jamat:${slug}:${module}`);
  res.status(201).json({ success: true, data: { id: newDoc.id } });
});

/**
 * @route   PUT /api/v1/portal/jamat/:slug/data/:module/:itemId
 * @desc    Update an item in a Jamat portal module
 * @access  Jamat Portal JWT
 */
export const updateJamatModuleItem = asyncHandler(async (req, res, next) => {
  const { slug, module, itemId } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));
  if (!jamatUser.enabledModules.includes(module)) {
    return next(new AppError(`Module "${module}" not enabled.`, 403));
  }

  const db = getFirestore();
  const docRef = db
    .collection(JAMAT_PORTALS_COLLECTION)
    .doc(slug)
    .collection(module)
    .doc(itemId);

  await docRef.update({ ...req.body, updatedAt: new Date().toISOString() });

  moduleDataCache.del(`jamat:${slug}:${module}`);
  res.status(200).json({ success: true, message: "Item updated." });
});

/**
 * @route   DELETE /api/v1/portal/jamat/:slug/data/:module/:itemId
 * @desc    Delete an item from a Jamat portal module
 * @access  Jamat Portal JWT
 */
export const deleteJamatModuleItem = asyncHandler(async (req, res, next) => {
  const { slug, module, itemId } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));
  if (!jamatUser.enabledModules.includes(module)) {
    return next(new AppError(`Module "${module}" not enabled.`, 403));
  }

  const db = getFirestore();
  await db
    .collection(JAMAT_PORTALS_COLLECTION)
    .doc(slug)
    .collection(module)
    .doc(itemId)
    .delete();

  moduleDataCache.del(`jamat:${slug}:${module}`);
  res.status(200).json({ success: true, message: "Item deleted." });
});

/**
 * @route   GET /api/v1/portal/jamat/:slug/settings
 * @desc    Get Jamat portal settings (theme, hidden modules)
 * @access  Jamat Portal JWT
 */
export const getJamatSettings = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));

  const db = getFirestore();
  const doc = await db.collection(JAMAT_PORTALS_COLLECTION).doc(slug).get();

  const settings = doc.data()?.settings || {
    theme: { primary: "#31757A", secondary: "#41A4A7" },
    hiddenModules: [],
  };

  res.status(200).json({ success: true, data: { settings } });
});

/**
 * @route   PUT /api/v1/portal/jamat/:slug/settings
 * @desc    Update Jamat portal settings (theme, hidden modules)
 * @access  Jamat Portal JWT
 */
export const updateJamatSettings = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));

  const { theme, hiddenModules } = req.body;
  const update = {};
  if (theme) update["settings.theme"] = theme;
  if (Array.isArray(hiddenModules))
    update["settings.hiddenModules"] = hiddenModules;

  const db = getFirestore();
  await db.collection(JAMAT_PORTALS_COLLECTION).doc(slug).update(update);

  res.status(200).json({ success: true, message: "Settings updated." });
});

// ════════════════════════════════════════════════════════════════════════════
// PART E: CUSTOM FIELD SCHEMAS (per jamat, per module)
//
// Firestore hierarchy:
//   jamat_portals/{slug}/                    ← portal metadata + credentials
//   jamat_portals/{slug}/_schemas/{module}   ← custom field definitions
//   jamat_portals/{slug}/{module}/_meta      ← module metadata
//   jamat_portals/{slug}/{module}/{itemId}   ← actual data (uses schema fields)
//
// Each schema document contains:
//   { module, fields: [{ name, type, required, options? }], updatedAt }
//
// This gives every jamat an isolated namespace that feels like their own
// Firebase project. For migration/export the entire sub-tree is dumped.
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/v1/portal/jamat/:slug/schema/:module
 * @desc    Get custom field schema for a module
 * @access  Jamat Portal JWT
 */
export const getModuleSchema = asyncHandler(async (req, res, next) => {
  const { slug, module } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));
  if (!jamatUser.enabledModules.includes(module)) {
    return next(new AppError(`Module "${module}" is not enabled.`, 403));
  }

  const db = getFirestore();
  const schemaDoc = await db
    .collection(JAMAT_PORTALS_COLLECTION)
    .doc(slug)
    .collection("_schemas")
    .doc(module)
    .get();

  const schema = schemaDoc.exists
    ? schemaDoc.data()
    : { module, fields: [] };

  res.status(200).json({ success: true, data: { schema } });
});

/**
 * @route   PUT /api/v1/portal/jamat/:slug/schema/:module
 * @desc    Save (replace) custom field schema for a module
 * @access  Jamat Portal JWT
 *
 * Body: { fields: [{ name, label, type, required, options? }] }
 * Supported types: text | number | date | select | multiselect | textarea | boolean
 */
export const saveModuleSchema = asyncHandler(async (req, res, next) => {
  const { slug, module } = req.params;
  const { jamatUser } = req;

  if (jamatUser.slug !== slug) return next(new AppError("Access denied.", 403));
  if (!jamatUser.enabledModules.includes(module)) {
    return next(new AppError(`Module "${module}" is not enabled.`, 403));
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return next(new AppError("fields must be an array.", 400));
  }

  const ALLOWED_TYPES = [
    "text", "number", "date", "select", "multiselect", "textarea", "boolean",
  ];

  const sanitized = fields.map((f, i) => {
    if (!f.name || typeof f.name !== "string") {
      throw new AppError(`Field at index ${i} missing a valid "name".`, 400);
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      throw new AppError(
        `Field "${f.name}" has invalid type "${f.type}". Allowed: ${ALLOWED_TYPES.join(", ")}`,
        400,
      );
    }
    return {
      name: String(f.name).trim(),
      label: String(f.label || f.name).trim(),
      type: f.type,
      required: Boolean(f.required),
      ...(Array.isArray(f.options) ? { options: f.options.map(String) } : {}),
    };
  });

  const db = getFirestore();
  await db
    .collection(JAMAT_PORTALS_COLLECTION)
    .doc(slug)
    .collection("_schemas")
    .doc(module)
    .set({
      module,
      fields: sanitized,
      updatedAt: new Date().toISOString(),
    });

  // Invalidate module data cache so next GET re-reads with new schema context
  moduleDataCache.del(`jamat:${slug}:${module}`);

  logger.info(`Schema saved: portal=${slug} module=${module} fields=${sanitized.length}`);
  res.status(200).json({
    success: true,
    message: "Schema saved.",
    data: { schema: { module, fields: sanitized } },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PART F: FULL DATABASE EXPORT (migration)
//
// Returns the entire jamat namespace as a structured JSON object that mirrors
// the Firestore hierarchy. A jamat can take this JSON and import it into their
// own Firebase project with no platform lock-in.
//
// Structure:
// {
//   portal: { slug, jamatName, enabledModules, settings, createdAt },
//   schemas: { [module]: { fields: [...] } },
//   collections: {
//     [module]: [ { id, ...fields }, ... ]
//   }
// }
// ════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/v1/portal/jamat/:slug/export
 * @desc    Export entire jamat database as JSON (for migration)
 * @access  Jamat Portal JWT  OR  Admin JWT
 */
export const exportJamatDatabase = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;

  // Allow either the jamat's own token or an admin token
  const isJamatUser = req.jamatUser?.slug === slug;
  const isAdmin = req.user?.role === "admin";

  if (!isJamatUser && !isAdmin) {
    return next(new AppError("Access denied.", 403));
  }

  const db = getFirestore();
  const portalRef = db.collection(JAMAT_PORTALS_COLLECTION).doc(slug);
  const portalDoc = await portalRef.get();

  if (!portalDoc.exists) {
    return next(new AppError(`Portal "${slug}" not found.`, 404));
  }

  const portalData = portalDoc.data();
  const enabledModules = portalData.enabledModules || [];

  // 1. Fetch all schema definitions
  const schemasSnap = await portalRef.collection("_schemas").get();
  const schemas = {};
  for (const d of schemasSnap.docs) {
    schemas[d.id] = d.data();
  }

  // 2. Fetch all data collections in parallel
  const collectionFetches = enabledModules.map(async (mod) => {
    const snap = await portalRef.collection(mod).get();
    const items = snap.docs
      .filter((d) => d.id !== "_meta")
      .map((d) => ({ _id: d.id, ...d.data() }));
    return [mod, items];
  });

  const collectionResults = await Promise.all(collectionFetches);
  const collections = Object.fromEntries(collectionResults);

  const exportPayload = {
    _exportedAt: new Date().toISOString(),
    _exportVersion: "1.0",
    portal: {
      slug,
      jamatName: portalData.jamatName,
      enabledModules,
      settings: portalData.settings || {},
      createdAt: portalData.createdAt,
    },
    schemas,
    collections,
  };

  logger.info(
    `Database exported: portal=${slug} by ${isAdmin ? `admin:${req.user?.memberId}` : "jamat_user"}`,
  );

  res
    .status(200)
    .setHeader(
      "Content-Disposition",
      `attachment; filename="${slug}_export_${Date.now()}.json"`,
    )
    .json({
      success: true,
      data: exportPayload,
    });
});

