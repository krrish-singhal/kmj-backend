/**
 * Firebase Admin / Firestore Initialization
 *
 * Supports credentials via env:
 * - FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON)
 * - FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 of JSON)
 * - FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file)
 * - GOOGLE_APPLICATION_CREDENTIALS (path to JSON file)
 */

import admin from "firebase-admin";
import fs from "fs";
import { logger } from "../utils/logger.js";

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const normalizePrivateKey = (value) => {
  if (!value) return value;
  // Common pattern: private keys stored with literal "\n" in env
  return value.replace(/\\n/g, "\n");
};

const loadServiceAccountFromEnv = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed.private_key)
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    return parsed;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64",
    ).toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed.private_key)
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    return parsed;
  }

  const pathFromEnv =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (pathFromEnv) {
    const parsed = readJsonFile(pathFromEnv);
    if (parsed.private_key)
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    return parsed;
  }

  // Alternate split creds
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    };
  }

  return null;
};

export const initFirebase = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = loadServiceAccountFromEnv();

  if (!serviceAccount) {
    throw new Error(
      "Missing Firebase credentials. Provide FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.",
    );
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount.project_id ||
    serviceAccount.projectId;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });

  const db = admin.firestore();

  const emulatorHostRaw = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHostRaw) {
    const host = String(emulatorHostRaw).replace(/^https?:\/\//, "");
    db.settings({
      host,
      ssl: false,
      ignoreUndefinedProperties: true,
    });
    logger.warn(`⚠️  Firestore emulator enabled (${host})`);
  } else {
    db.settings({ ignoreUndefinedProperties: true });
  }

  logger.info(
    `✅ Firebase initialized${projectId ? ` (project: ${projectId})` : ""}`,
  );

  return admin.app();
};

export const getFirestore = () => {
  initFirebase();
  return admin.firestore();
};

export const getFieldValue = () => admin.firestore.FieldValue;
