/**
 * Central Firestore DB Export
 *
 * ESM equivalent of:
 * const admin = require('firebase-admin');
 * if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) });
 * const db = admin.firestore();
 * module.exports = db;
 */

import admin from 'firebase-admin';
import { initFirebase } from './firebase.js';

// Initialize exactly once (credentials resolved in config/firebase.js)
initFirebase();

export const db = admin.firestore();
export default db;
