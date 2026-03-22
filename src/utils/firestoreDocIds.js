/**
 * Firestore docId helpers.
 *
 * Firestore document IDs cannot contain '/'. Some of our member IDs do (e.g. ADMIN/001, ward/houseNo).
 * This utility provides a stable way to map those member IDs to valid document IDs.
 */

import { Buffer } from 'node:buffer';

const toBase64Url = (value) => {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const userDocIdFromMemberId = (memberId) => {
  const normalized = String(memberId || '').trim();
  if (!normalized) return '';

  // Preserve old layout when memberId is already a valid docId.
  if (!normalized.includes('/')) return normalized;

  // For IDs that include '/', store under a safe, deterministic docId.
  return `mid_${toBase64Url(normalized)}`;
};
