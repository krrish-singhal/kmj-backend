import { createFirestoreModel } from "../db/firestore/model.js";
import { COLLECTIONS } from "../db/firestore/collectionNames.js";
import { matchesFilter } from "../db/firestore/utils.js";

const bucketAges = ({ docs, boundaries, defaultLabel }) => {
  const buckets = new Map();
  const add = (key) => buckets.set(key, (buckets.get(key) || 0) + 1);

  for (const doc of docs) {
    const dob = doc.Dob ? new Date(doc.Dob) : null;
    if (!dob || Number.isNaN(dob.getTime())) {
      add(defaultLabel);
      continue;
    }
    const age = (Date.now() - dob.getTime()) / (365 * 24 * 60 * 60 * 1000);

    let placed = false;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lo = boundaries[i];
      const hi = boundaries[i + 1];
      if (age >= lo && age < hi) {
        add(lo);
        placed = true;
        break;
      }
    }
    if (!placed) add(defaultLabel);
  }

  const out = [];
  for (const [key, count] of buckets.entries()) {
    out.push({ _id: key, count });
  }

  // Sort buckets numerically, with default last
  out.sort((a, b) => {
    if (a._id === defaultLabel) return 1;
    if (b._id === defaultLabel) return -1;
    return Number(a._id) - Number(b._id);
  });

  return out;
};

const Member = createFirestoreModel({
  modelName: "Member",
  collectionName: COLLECTIONS.members,
  statics: {
    findByMahalId(mahalId) {
      return this.find({ Mid: mahalId, isActive: true }).sort({ Relation: 1 });
    },

    findHousehold(mahalId) {
      return this.find({ Mid: mahalId, isActive: true }).sort({
        Relation: 1,
        Dob: 1,
      });
    },

    findByWard(ward) {
      return this.find({ Mward: ward, isActive: true }).sort({
        Mid: 1,
        Relation: 1,
      });
    },

    async getStatistics() {
      const docs = await this.find({ isActive: true }).lean();
      const totalMembers = docs.length;
      const households = new Set(docs.map((d) => d.Mid).filter(Boolean));
      const maleCount = docs.filter(
        (d) => String(d.Gender || "").toLowerCase() === "male",
      ).length;
      const femaleCount = docs.filter(
        (d) => String(d.Gender || "").toLowerCase() === "female",
      ).length;
      const marriedCount = docs.filter(
        (d) => String(d.Mstatus || "").toLowerCase() === "married",
      ).length;
      const singleCount = docs.filter(
        (d) => String(d.Mstatus || "").toLowerCase() === "single",
      ).length;

      return {
        totalMembers,
        totalHouseholds: households.size,
        maleCount,
        femaleCount,
        marriedCount,
        singleCount,
      };
    },

    async aggregate(pipeline = []) {
      // Purpose-built aggregate support for Member stats controller.
      // Supports: $match, $group, $sort, $limit, $project (ignored), $bucket (age buckets).
      let working = await this.find({}).lean();

      for (const stage of pipeline) {
        if (stage.$match) {
          working = working.filter((d) => matchesFilter(d, stage.$match));
          continue;
        }

        if (stage.$project) {
          // The controller uses $project to compute age before bucketing.
          // We compute age directly from Dob when handling $bucket.
          continue;
        }

        if (stage.$bucket) {
          const b = stage.$bucket;
          const boundaries = b.boundaries || [0, 18, 30, 45, 60, 100];
          const defaultLabel = b.default ?? "Unknown";
          working = bucketAges({ docs: working, boundaries, defaultLabel });
          continue;
        }

        if (stage.$group) {
          const groupSpec = stage.$group;
          const idExpr = groupSpec._id;
          const grouped = new Map();

          const keyFor = (doc) => {
            if (idExpr === null) return null;
            if (typeof idExpr === "string" && idExpr.startsWith("$")) {
              const field = idExpr.slice(1);
              return doc[field] ?? null;
            }
            return idExpr;
          };

          for (const doc of working) {
            const key = keyFor(doc);
            if (!grouped.has(key)) grouped.set(key, { _id: key });
            const acc = grouped.get(key);
            for (const [outField, expr] of Object.entries(groupSpec)) {
              if (outField === "_id") continue;
              if (expr && typeof expr === "object" && "$sum" in expr) {
                const sumExpr = expr.$sum;
                if (sumExpr === 1) {
                  acc[outField] = (acc[outField] || 0) + 1;
                }
              }
            }
          }

          working = [...grouped.values()];
          continue;
        }

        if (stage.$sort) {
          const [[field, dir]] = Object.entries(stage.$sort);
          const direction = dir === -1 ? -1 : 1;
          working.sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av === bv) return 0;
            if (av === undefined || av === null) return 1;
            if (bv === undefined || bv === null) return -1;
            return direction * String(av).localeCompare(String(bv));
          });
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
  },
  methods: {
    getFamilyMembers() {
      return this.constructor?.findByMahalId
        ? this.constructor.findByMahalId(this.Mid)
        : [];
    },
  },
});

export default Member;
