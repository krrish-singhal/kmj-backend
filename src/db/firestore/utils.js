import crypto from "crypto";

export const nowDate = () => new Date();

export const toDate = (value) => {
  if (!value) return value;
  // Firestore Timestamp
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
};

export const stripUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    out[key] =
      value && typeof value === "object" && !(value instanceof Date)
        ? stripUndefined(value)
        : value;
  }
  return out;
};

export const generateId = () => crypto.randomUUID();

export const parseSelect = (selectStr) => {
  if (!selectStr || typeof selectStr !== "string") {
    return { include: new Set(), exclude: new Set() };
  }
  const include = new Set();
  const exclude = new Set();
  const parts = selectStr
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("-")) exclude.add(part.slice(1));
    else if (part.startsWith("+")) include.add(part.slice(1));
    else include.add(part);
  }
  return { include, exclude };
};

export const applySelect = (doc, defaultExclude = [], selectStr) => {
  if (!doc) return doc;
  const { include, exclude } = parseSelect(selectStr);

  const out = { ...doc };

  // Apply default excludes unless explicitly included
  for (const field of defaultExclude) {
    if (!include.has(field)) delete out[field];
  }

  // Apply explicit excludes
  for (const field of exclude) {
    delete out[field];
  }

  // If includes are present (and they're not only "+field" overrides), we *don't* mimic Mongoose's strict projection rules
  // because many controllers rely on full docs with just password hidden. So we keep full doc by default.
  return out;
};

export const matchWhere = (docValue, condition) => {
  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    if ("$gte" in condition && !(docValue >= condition.$gte)) return false;
    if ("$gt" in condition && !(docValue > condition.$gt)) return false;
    if ("$lte" in condition && !(docValue <= condition.$lte)) return false;
    if ("$lt" in condition && !(docValue < condition.$lt)) return false;
    if ("$ne" in condition && !(docValue !== condition.$ne)) return false;

    if ("$in" in condition) {
      const arr = Array.isArray(condition.$in) ? condition.$in : [];
      return arr.some((v) => docValue === v);
    }

    if ("$regex" in condition) {
      const flags = (condition.$options || "").replace(/[^gimsuy]/g, "");
      const re = new RegExp(condition.$regex, flags);
      return re.test(String(docValue ?? ""));
    }
  }

  // equality
  return docValue === condition;
};

export const matchesFilter = (doc, filter) => {
  if (!filter || Object.keys(filter).length === 0) return true;

  // root $or
  if (Array.isArray(filter.$or)) {
    return filter.$or.some((sub) => matchesFilter(doc, sub));
  }

  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") continue;

    // dot-path support
    const docValue = key
      .split(".")
      .reduce((acc, part) => (acc ? acc[part] : undefined), doc);
    if (!matchWhere(docValue, condition)) return false;
  }

  return true;
};

export const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};
