import { getFirestore, getFieldValue } from "../../config/firebase.js";
import {
  applySelect,
  compareValues,
  generateId,
  matchesFilter,
  stripUndefined,
  toDate,
} from "./utils.js";

class FirestoreDocument {
  constructor(model, raw) {
    this.__model = model;
    Object.assign(this, raw);
  }

  async populate(path, selectStr) {
    if (!path) return this;

    const doPopulate = async (p, sel) => {
      const refSpec = this.__model.refs?.[p];
      if (!refSpec) return;
      const refValue = this[p];
      if (!refValue) return;
      const refId =
        typeof refValue === "object" && refValue._id ? refValue._id : refValue;
      const refModel = refSpec.model;
      const populated = await refModel
        .findById(String(refId))
        .select(sel || refSpec.select)
        .lean();
      this[p] = populated || null;
    };

    if (Array.isArray(path)) {
      for (const p of path) {
        if (typeof p === "string") await doPopulate(p, selectStr);
        else if (p && typeof p === "object") await doPopulate(p.path, p.select);
      }
      return this;
    }

    await doPopulate(path, selectStr);
    return this;
  }

  async populate(path, selectStr) {
    const refSpec = this.__model?.refs?.[path];
    if (!refSpec || !refSpec.model) return this;

    const rawRef = this[path];
    const refId =
      rawRef && typeof rawRef === "object" ? rawRef._id || rawRef.id : rawRef;

    if (!refId) {
      this[path] = null;
      return this;
    }

    const q = refSpec.model.findById(String(refId));
    if (selectStr) q.select(selectStr);
    const populated = await q.lean();
    this[path] = populated || null;
    return this;
  }

  toObject() {
    const out = {};
    for (const [key, value] of Object.entries(this)) {
      if (key === "__model") continue;
      if (key.startsWith("__")) continue;
      if (typeof value === "function") continue;
      if (typeof value === "symbol") continue;
      out[key] = value;
    }
    return out;
  }

  toJSON() {
    return this.toObject();
  }

  async save(options = {}) {
    const validateBeforeSave = options?.validateBeforeSave !== false;
    if (typeof this.__model._beforeSave === "function") {
      await this.__model._beforeSave(this, { validateBeforeSave });
    }

    const db = getFirestore();
    const id = this._id;
    if (!id)
      throw new Error(
        `${this.__model.modelName}: cannot save document without _id`,
      );

    const payload = stripUndefined({ ...this.toObject() });
    // Keep timestamps consistent with previous Mongoose behavior
    payload.updatedAt = new Date();

    await db
      .collection(this.__model.collectionName)
      .doc(String(id))
      .set(payload, { merge: true });
    return this;
  }
}

class FirestoreQuery {
  constructor(model) {
    this.model = model;
    this.filter = {};
    this._select = undefined;
    this._sort = undefined;
    this._skip = 0;
    this._limit = undefined;
    this._populate = [];
    this._lean = false;
    this._mode = "many"; // many | one
    this._byId = undefined;
  }

  where(filter) {
    this.filter = filter || {};
    return this;
  }

  byId(id) {
    this._byId = id;
    this._mode = "one";
    return this;
  }

  one() {
    this._mode = "one";
    this._limit = 1;
    return this;
  }

  select(selectStr) {
    this._select = selectStr;
    return this;
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  skip(n) {
    this._skip = Number(n) || 0;
    return this;
  }

  limit(n) {
    const parsed = Number(n);
    this._limit = Number.isFinite(parsed) ? parsed : undefined;
    return this;
  }

  populate(path, selectStr) {
    this._populate.push({ path, select: selectStr });
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async _applyPopulate(docs) {
    if (!docs || this._populate.length === 0) return docs;

    const populated = [];
    for (const doc of docs) {
      const copy = { ...doc };
      for (const p of this._populate) {
        const refSpec = this.model.refs?.[p.path];
        if (!refSpec) continue;

        const refValue = copy[p.path];
        if (!refValue) continue;

        const refId =
          typeof refValue === "object" && refValue._id
            ? refValue._id
            : refValue;
        const refModel = refSpec.model;

        const refDoc = await refModel
          .findById(String(refId))
          .select(p.select || refSpec.select)
          .lean();
        copy[p.path] = refDoc || null;
      }
      populated.push(copy);
    }
    return populated;
  }

  async exec() {
    const db = getFirestore();

    // Direct document fetch
    if (this._byId !== undefined && this._byId !== null) {
      const snap = await db
        .collection(this.model.collectionName)
        .doc(String(this._byId))
        .get();
      if (!snap.exists) return null;
      const data = { _id: snap.id, ...snap.data() };
      // Normalize timestamps
      if (data.createdAt) data.createdAt = toDate(data.createdAt);
      if (data.updatedAt) data.updatedAt = toDate(data.updatedAt);

      let selected = applySelect(
        data,
        this.model.defaultExcludeFields,
        this._select,
      );
      if (this._populate.length) {
        const [pop] = await this._applyPopulate([selected]);
        selected = pop;
      }

      return this._lean
        ? selected
        : new FirestoreDocument(this.model, selected);
    }

    const filter = this.filter || {};

    const analyzeFilter = (f) => {
      const meta = {
        hasOr: false,
        hasRegex: false,
        hasUnknownOperator: false,
        inequalityFields: [],
      };

      if (!f || typeof f !== "object") return meta;

      for (const [key, condition] of Object.entries(f)) {
        if (key === "$or") {
          meta.hasOr = Array.isArray(condition) && condition.length > 0;
          continue;
        }

        if (key.startsWith("$")) {
          meta.hasUnknownOperator = true;
          continue;
        }

        if (
          condition &&
          typeof condition === "object" &&
          !Array.isArray(condition) &&
          !(condition instanceof Date)
        ) {
          const known = new Set([
            "$gte",
            "$gt",
            "$lte",
            "$lt",
            "$ne",
            "$in",
            "$regex",
            "$options",
          ]);
          for (const op of Object.keys(condition)) {
            if (!known.has(op)) meta.hasUnknownOperator = true;
          }

          if ("$regex" in condition) meta.hasRegex = true;

          if ("$ne" in condition) meta.inequalityFields.push(key);
          if (
            "$gte" in condition ||
            "$gt" in condition ||
            "$lte" in condition ||
            "$lt" in condition
          ) {
            meta.inequalityFields.push(key);
          }
        }
      }

      meta.inequalityFields = [...new Set(meta.inequalityFields)];
      return meta;
    };

    const filterMeta = analyzeFilter(filter);
    const canUseNativeQuery =
      !filterMeta.hasOr &&
      !filterMeta.hasRegex &&
      !filterMeta.hasUnknownOperator;

    const MAX_FETCH = Number(process.env.FIRESTORE_QUERY_MAX_FETCH || 500);
    const DEFAULT_LIMIT = Number(process.env.FIRESTORE_DEFAULT_LIMIT || 20);
    const requestedSkip = Number(this._skip) || 0;
    const requestedLimitRaw =
      this._limit !== undefined && this._limit !== null
        ? Number(this._limit)
        : undefined;
    const requestedLimit =
      Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
        ? requestedLimitRaw
        : DEFAULT_LIMIT;

    // For non-native queries, we cap total documents fetched to avoid full scans.
    // We over-fetch (skip + limit) when possible, then slice in JS.
    const overFetchLimit = (() => {
      if (requestedLimit === undefined) return MAX_FETCH;
      const need = Math.max(0, requestedSkip + requestedLimit);
      return Math.min(MAX_FETCH, need || requestedLimit || MAX_FETCH);
    })();

    const runSingleQuery = async (singleFilter) => {
      const singleMeta = analyzeFilter(singleFilter);
      const nativeOk =
        !singleMeta.hasOr &&
        !singleMeta.hasRegex &&
        !singleMeta.hasUnknownOperator;

      let q = db.collection(this.model.collectionName);

      // Apply Firestore-native filters when possible; anything not supported is handled by post-filter below.
      for (const [key, condition] of Object.entries(singleFilter || {})) {
        if (key === "$or") continue;

        if (
          condition &&
          typeof condition === "object" &&
          !Array.isArray(condition) &&
          !(condition instanceof Date)
        ) {
          const hasRegex = "$regex" in condition;
          const hasNe = "$ne" in condition;
          const hasIn = "$in" in condition;
          const hasRange =
            "$gte" in condition ||
            "$gt" in condition ||
            "$lte" in condition ||
            "$lt" in condition;
          if (hasRegex) continue;

          if (hasIn) {
            const arr = Array.isArray(condition.$in) ? condition.$in : [];
            // Firestore limits 'in' to 10 values; if violated, fall back to post-filter.
            if (arr.length > 0 && arr.length <= 10) {
              try {
                q = q.where(key, "in", arr);
              } catch {
                // ignore; will post-filter
              }
            }
            continue;
          }

          if (hasNe) {
            try {
              q = q.where(key, "!=", condition.$ne);
            } catch {
              // ignore; will post-filter
            }
            continue;
          }

          if (hasRange) {
            if ("$gte" in condition) q = q.where(key, ">=", condition.$gte);
            if ("$gt" in condition) q = q.where(key, ">", condition.$gt);
            if ("$lte" in condition) q = q.where(key, "<=", condition.$lte);
            if ("$lt" in condition) q = q.where(key, "<", condition.$lt);
            continue;
          }
        }

        // equality
        try {
          q = q.where(key, "==", condition);
        } catch {
          // ignore; will post-filter
        }
      }

      // Keep a reference to the filtered query *before* sorting/pagination.
      // Firestore missing-index errors happen at execution time (q.get), so we may need to retry.
      const qFiltered = q;

      if (nativeOk) {
        // Sorting (best-effort). If Firestore rejects orderBy (missing index), we fall back to JS sort.
        if (this._sort && typeof this._sort === "object") {
          try {
            const [[sortField, sortDir]] = Object.entries(this._sort);
            const direction =
              sortDir === -1 || sortDir === "desc" ? "desc" : "asc";

            // Firestore inequality rule: first orderBy must match inequality field.
            // Only apply sortField orderBy directly if it doesn't violate inequality constraints.
            const [ineqField] = singleMeta.inequalityFields;
            if (!ineqField || ineqField === sortField) {
              q = q.orderBy(sortField, direction);
            } else {
              // Keep query valid; then JS will sort by requested sortField after fetch.
              q = q.orderBy(ineqField, "asc");
            }
          } catch {
            // ignore; JS sort later
          }
        }

        // Pagination
        if (requestedSkip) {
          try {
            q = q.offset(requestedSkip);
          } catch {
            // ignore
          }
        }

        if (requestedLimit !== undefined) {
          try {
            q = q.limit(requestedLimit);
          } catch {
            // ignore
          }
        }
      } else {
        // Non-native: cap reads to prevent full scans.
        try {
          q = q.limit(overFetchLimit);
        } catch {
          // ignore
        }
      }

      const isMissingIndexError = (err) => {
        const msg = String(err?.message || "");
        return err?.code === 9 && /index/i.test(msg);
      };

      try {
        const snap = await q.get();
        return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
      } catch (err) {
        // If a native filtered+sorted query fails due to missing composite index,
        // retry without orderBy/offset/limit and do sort/pagination in JS.
        if (nativeOk && isMissingIndexError(err)) {
          let qFallback = qFiltered;
          try {
            qFallback = qFallback.limit(overFetchLimit);
          } catch {
            // ignore
          }

          const snap2 = await qFallback.get();
          let docs2 = snap2.docs.map((d) => ({ _id: d.id, ...d.data() }));

          if (this._sort && typeof this._sort === "object") {
            const [[field, dir]] = Object.entries(this._sort);
            const direction = dir === -1 || dir === "desc" ? -1 : 1;
            docs2.sort((a, b) => direction * compareValues(a[field], b[field]));
          }

          if (requestedSkip) docs2 = docs2.slice(requestedSkip);
          if (requestedLimit !== undefined)
            docs2 = docs2.slice(0, requestedLimit);

          return docs2;
        }

        throw err;
      }
    };

    let docs = [];

    if (Array.isArray(filter.$or) && filter.$or.length) {
      const results = await Promise.all(
        filter.$or.map((sub) =>
          runSingleQuery({ ...filter, ...sub, $or: undefined }),
        ),
      );
      const merged = new Map();
      for (const arr of results) {
        for (const doc of arr) merged.set(String(doc._id), doc);
      }
      docs = [...merged.values()];
    } else {
      docs = await runSingleQuery(filter);
    }

    // Normalize timestamps
    for (const d of docs) {
      if (d.createdAt) d.createdAt = toDate(d.createdAt);
      if (d.updatedAt) d.updatedAt = toDate(d.updatedAt);
      // Common alternate field names
      if (d.Date) d.Date = toDate(d.Date);
      if (d.date) d.date = toDate(d.date);
      if (d.Date_time) d.Date_time = toDate(d.Date_time);
    }

    // Post-filter (regex, $or, etc)
    docs = docs.filter((d) => matchesFilter(d, filter));

    // Sort/Pagination in JS only when we couldn't do it safely in Firestore.
    if (!canUseNativeQuery) {
      if (this._sort && typeof this._sort === "object") {
        const [[field, dir]] = Object.entries(this._sort);
        const direction = dir === -1 || dir === "desc" ? -1 : 1;
        docs.sort((a, b) => direction * compareValues(a[field], b[field]));
      }

      if (this._skip) docs = docs.slice(this._skip);
      if (this._limit !== undefined && this._limit !== null)
        docs = docs.slice(0, this._limit);
    }

    // Select
    docs = docs.map((d) =>
      applySelect(d, this.model.defaultExcludeFields, this._select),
    );

    // Populate
    docs = await this._applyPopulate(docs);

    if (this._mode === "one") {
      const first = docs[0] || null;
      return this._lean
        ? first
        : first
          ? new FirestoreDocument(this.model, first)
          : null;
    }

    return this._lean
      ? docs
      : docs.map((d) => new FirestoreDocument(this.model, d));
  }

  // Make it awaitable like Mongoose Query
  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

const applyUpdateOperators = (current, update) => {
  const out = { ...current };

  const inc = update?.$inc || {};
  for (const [field, by] of Object.entries(inc)) {
    const prev = Number(out[field] || 0);
    out[field] = prev + Number(by);
  }

  const set = update?.$set || {};
  for (const [field, value] of Object.entries(set)) {
    out[field] = value;
  }

  const setOnInsert = update?.$setOnInsert || {};
  // Caller must decide whether to apply setOnInsert (only when created)

  // Direct assignments (mongoose allows update without operators)
  for (const [field, value] of Object.entries(update || {})) {
    if (field.startsWith("$")) continue;
    out[field] = value;
  }

  return { out, setOnInsert };
};

export const createFirestoreModel = ({
  modelName,
  collectionName,
  defaultExcludeFields = [],
  refs = {},
  beforeCreate,
  beforeSave,
  statics = {},
  methods = {},
} = {}) => {
  if (!modelName)
    throw new Error("createFirestoreModel: modelName is required");

  const Model = {
    modelName,
    collectionName: collectionName || `${modelName.toLowerCase()}s`,
    defaultExcludeFields,
    refs,
    _beforeCreate: beforeCreate,
    _beforeSave: beforeSave,

    find(filter = {}) {
      return new FirestoreQuery(Model).where(filter);
    },

    findOne(filter = {}) {
      return new FirestoreQuery(Model).where(filter).one();
    },

    findById(id) {
      return new FirestoreQuery(Model).byId(id);
    },

    async create(data = {}) {
      const db = getFirestore();
      const id = data._id ? String(data._id) : generateId();

      const doc = { _id: id, ...data };

      if (typeof Model._beforeCreate === "function") {
        await Model._beforeCreate(doc);
      }

      // timestamps
      if (!doc.createdAt) doc.createdAt = new Date();
      doc.updatedAt = new Date();

      const payload = stripUndefined({ ...doc });
      delete payload._id;

      await db
        .collection(Model.collectionName)
        .doc(id)
        .set(payload, { merge: false });

      // Return like Mongoose: a document instance
      const selected = applySelect(
        { _id: id, ...payload },
        Model.defaultExcludeFields,
        undefined,
      );
      const instance = new FirestoreDocument(Model, selected);
      Object.assign(instance, methods);
      return instance;
    },

    async countDocuments(filter = {}) {
      const db = getFirestore();

      const analyze = (f) => {
        const meta = {
          hasOr: false,
          hasRegex: false,
          hasUnknownOperator: false,
        };
        if (!f || typeof f !== "object") return meta;
        for (const [key, condition] of Object.entries(f)) {
          if (key === "$or") {
            meta.hasOr = Array.isArray(condition) && condition.length > 0;
            continue;
          }
          if (key.startsWith("$")) {
            meta.hasUnknownOperator = true;
            continue;
          }
          if (
            condition &&
            typeof condition === "object" &&
            !Array.isArray(condition) &&
            !(condition instanceof Date)
          ) {
            const known = new Set([
              "$gte",
              "$gt",
              "$lte",
              "$lt",
              "$ne",
              "$in",
              "$regex",
              "$options",
            ]);
            for (const op of Object.keys(condition)) {
              if (!known.has(op)) meta.hasUnknownOperator = true;
            }
            if ("$regex" in condition) meta.hasRegex = true;
          }
        }
        return meta;
      };

      const meta = analyze(filter);
      const canUseNativeCount =
        !meta.hasOr && !meta.hasRegex && !meta.hasUnknownOperator;

      if (canUseNativeCount) {
        let q = db.collection(Model.collectionName);
        for (const [key, condition] of Object.entries(filter || {})) {
          if (key === "$or") continue;
          if (
            condition &&
            typeof condition === "object" &&
            !Array.isArray(condition) &&
            !(condition instanceof Date)
          ) {
            if ("$in" in condition) {
              const arr = Array.isArray(condition.$in) ? condition.$in : [];
              if (arr.length > 0 && arr.length <= 10) {
                try {
                  q = q.where(key, "in", arr);
                } catch {
                  return 0;
                }
                continue;
              }
              return 0;
            }
            if ("$ne" in condition) {
              try {
                q = q.where(key, "!=", condition.$ne);
              } catch {
                // Avoid quota-exploding full scans.
                return 0;
              }
              continue;
            }
            if ("$gte" in condition) q = q.where(key, ">=", condition.$gte);
            if ("$gt" in condition) q = q.where(key, ">", condition.$gt);
            if ("$lte" in condition) q = q.where(key, "<=", condition.$lte);
            if ("$lt" in condition) q = q.where(key, "<", condition.$lt);
            continue;
          }
          q = q.where(key, "==", condition);
        }

        const snap = await q.count().get();
        return Number(snap.data().count || 0);
      }

      // Avoid quota-exploding full scans for complex filters ($or/$regex/etc).
      // Return 0 so routes remain functional without scanning whole collections.
      return 0;
    },

    async findByIdAndUpdate(id, update = {}, options = {}) {
      const db = getFirestore();
      const docRef = db.collection(Model.collectionName).doc(String(id));

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const exists = snap.exists;
        const current = exists
          ? { _id: snap.id, ...snap.data() }
          : { _id: String(id) };

        const { out, setOnInsert } = applyUpdateOperators(current, update);
        if (!exists && options.upsert) {
          Object.assign(out, setOnInsert);
          if (!out.createdAt) out.createdAt = new Date();
        }
        out.updatedAt = new Date();

        const payload = stripUndefined({ ...out });
        const { _id: _, ...withoutId } = payload;

        if (!exists && !options.upsert) {
          return null;
        }

        tx.set(docRef, withoutId, { merge: true });
        return payload;
      });

      if (!result) return null;
      const selected = applySelect(
        result,
        Model.defaultExcludeFields,
        undefined,
      );
      return options.new === false ? selected : selected;
    },

    async findByIdAndDelete(id) {
      const db = getFirestore();
      const ref = db.collection(Model.collectionName).doc(String(id));
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.delete();
      return { _id: snap.id, ...snap.data() };
    },

    async updateOne(filter = {}, update = {}, options = {}) {
      const doc = await Model.findOne(filter).lean();
      if (!doc) {
        if (options.upsert && filter && filter._id) {
          await Model.findByIdAndUpdate(filter._id, update, {
            upsert: true,
            new: true,
          });
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 1,
            upsertedId: filter._id,
          };
        }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      await Model.findByIdAndUpdate(doc._id, update, {
        upsert: false,
        new: true,
      });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },

    async aggregate(pipeline = []) {
      // Limited aggregate emulation used by controllers
      let working = await Model.find({}).lean();

      for (const stage of pipeline) {
        if (stage.$match) {
          working = working.filter((d) => matchesFilter(d, stage.$match));
          continue;
        }

        if (stage.$group) {
          const groupSpec = stage.$group;
          const idExpr = groupSpec._id;

          const groups = new Map();

          const getGroupKey = (doc) => {
            if (idExpr === null) return "__null__";
            if (typeof idExpr === "string" && idExpr.startsWith("$")) {
              const field = idExpr.slice(1);
              return doc[field] ?? null;
            }
            return idExpr;
          };

          for (const doc of working) {
            const key = getGroupKey(doc);
            if (!groups.has(key)) groups.set(key, { _id: key });
            const acc = groups.get(key);

            for (const [outField, expr] of Object.entries(groupSpec)) {
              if (outField === "_id") continue;

              if (expr && typeof expr === "object" && "$sum" in expr) {
                const sumExpr = expr.$sum;
                if (sumExpr === 1) {
                  acc[outField] = (acc[outField] || 0) + 1;
                } else if (
                  typeof sumExpr === "string" &&
                  sumExpr.startsWith("$")
                ) {
                  const field = sumExpr.slice(1);
                  acc[outField] =
                    (acc[outField] || 0) + Number(doc[field] || 0);
                }
              }

              if (expr && typeof expr === "object" && "$avg" in expr) {
                // compute avg in second pass using sum+count
                const avgExpr = expr.$avg;
                const field =
                  typeof avgExpr === "string" && avgExpr.startsWith("$")
                    ? avgExpr.slice(1)
                    : null;
                if (field) {
                  acc.__avg = acc.__avg || {};
                  acc.__avg[outField] = acc.__avg[outField] || {
                    sum: 0,
                    count: 0,
                  };
                  acc.__avg[outField].sum += Number(doc[field] || 0);
                  acc.__avg[outField].count += 1;
                }
              }
            }
          }

          const out = [];
          for (const g of groups.values()) {
            if (g.__avg) {
              for (const [field, v] of Object.entries(g.__avg)) {
                g[field] = v.count ? v.sum / v.count : 0;
              }
              delete g.__avg;
            }
            out.push(g);
          }
          working = out;
          continue;
        }

        if (stage.$sort) {
          const [[field, dir]] = Object.entries(stage.$sort);
          const direction = dir === -1 ? -1 : 1;
          working.sort((a, b) => direction * compareValues(a[field], b[field]));
          continue;
        }

        if (stage.$limit) {
          const lim = Number(stage.$limit) || 0;
          working = working.slice(0, lim);
          continue;
        }
      }

      return working;
    },

    getFieldValue,

    ...statics,
  };

  // Bind instance methods by attaching to FirestoreDocument instances in create/find
  Model._decorateInstance = (instance) => {
    Object.assign(instance, methods);
    return instance;
  };

  // Wrap query exec to decorate instances
  const origFind = Model.find.bind(Model);
  Model.find = (filter = {}) => {
    const q = origFind(filter);
    const origExec = q.exec.bind(q);
    q.exec = async () => {
      const res = await origExec();
      if (q._lean) return res;
      if (Array.isArray(res)) return res.map((d) => Model._decorateInstance(d));
      return res ? Model._decorateInstance(res) : res;
    };
    return q;
  };

  const origFindOne = Model.findOne.bind(Model);
  Model.findOne = (filter = {}) => {
    const q = origFindOne(filter);
    const origExec = q.exec.bind(q);
    q.exec = async () => {
      const res = await origExec();
      if (q._lean) return res;
      return res ? Model._decorateInstance(res) : res;
    };
    return q;
  };

  const origFindById = Model.findById.bind(Model);
  Model.findById = (id) => {
    const q = origFindById(id);
    const origExec = q.exec.bind(q);
    q.exec = async () => {
      const res = await origExec();
      if (q._lean) return res;
      return res ? Model._decorateInstance(res) : res;
    };
    return q;
  };

  // Hook save
  Model._beforeSave = async (doc, ctx) => {
    if (typeof beforeSave === "function") {
      await beforeSave(doc, ctx);
    }
  };

  return Model;
};
