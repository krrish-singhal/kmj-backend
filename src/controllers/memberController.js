/**
 * Member Controller
 * Handles all member/census management operations
 *
 * PHP Compatibility:
 * - membership.php (25-field census form)
 * - memberlist.php (member listing)
 * - edit_membership.php (edit census data)
 * - Userview.php (admin member view)
 */

import Member from "../models/Member.js";
import User from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";
import { createTtlCache } from "../utils/ttlCache.js";
import { getStoredCount, incrementStoredCount } from "../utils/statsStore.js";

const membersCache = createTtlCache(5_000);
const memberStatsCache = createTtlCache(300_000);

// Basic in-memory cache (most recent list response)
// Explicitly invalidated on member mutations.
let membersListCache = null;

/**
 * @desc    Get all members (paginated, searchable, filterable)
 * @route   GET /api/v1/members
 * @access  Private (Admin or User sees own family)
 *
 * Matches: PHP memberlist.php, Userview.php
 */
export const getAllMembers = async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    ward = "",
    gender = "",
    relation = "",
    education = "",
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Hard cap to reduce Firestore reads
  const safeLimit = Math.min(20, Math.max(1, parseInt(limit)));
  const pageNum = Math.max(1, parseInt(page));

  const cacheKey = `members:list:${req.user?.role}:${req.user?.memberId}:${pageNum}:${safeLimit}:${String(search).trim()}:${String(ward).trim()}:${String(gender).trim()}:${String(relation).trim()}:${String(education).trim()}:${String(sortBy).trim()}:${String(sortOrder).trim()}`;

  try {
    // Build filter query
    const filter = {};

    const buildInFilter = (
      raw,
      { numeric = false, caseVariants = false } = {},
    ) => {
      const base = String(raw ?? "").trim();
      if (!base) return null;

      const values = [base];

      if (caseVariants) {
        values.push(base.toLowerCase());
        values.push(base.toUpperCase());
        values.push(base.charAt(0).toUpperCase() + base.slice(1).toLowerCase());
      }

      if (numeric) {
        const n = Number(base);
        if (Number.isFinite(n) && String(n) === base) values.push(n);
      }

      const uniq = [...new Set(values)];
      return uniq.length === 1 ? uniq[0] : { $in: uniq };
    };

    // If user (not admin), only show their family members
    if (req.user.role !== "admin") {
      filter.Mid = req.user.memberId;
    }

    // Search across multiple fields
    if (search) {
      filter.$or = [
        { Fname: { $regex: search, $options: "i" } },
        { Mid: { $regex: search, $options: "i" } },
        { Aadhaar: { $regex: search, $options: "i" } },
        { Mobile: { $regex: search, $options: "i" } },
      ];
    }

    // Ward filter
    if (ward) {
      const wardFilter = buildInFilter(ward, { numeric: true });
      if (wardFilter !== null) filter.Mward = wardFilter;
    }

    // Gender filter
    if (gender) {
      const genderFilter = buildInFilter(gender, { caseVariants: true });
      if (genderFilter !== null) filter.Gender = genderFilter;
    }

    // Relation filter (head of family, spouse, etc.)
    if (relation) {
      const relationFilter = buildInFilter(relation, { caseVariants: true });
      if (relationFilter !== null) filter.Relation = relationFilter;
    }

    // Education filter
    if (education) {
      filter.Education = { $regex: education, $options: "i" };
    }

    // Pagination (offset-based; still capped at 20)
    const skip = (pageNum - 1) * safeLimit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    // As requested: simple module-level cache variable
    if (membersListCache && membersListCache.key === cacheKey) {
      return res.status(200).json(membersListCache.value);
    }

    const { members, hasNextPage } = await membersCache.wrap(
      cacheKey,
      async () => {
        const docs = await Member.find(filter)
          .select(
            "Fname Mid Mobile Mward Relation Gender Aadhaar Email createdAt updatedAt isActive",
          )
          .sort(sortOptions)
          .skip(skip)
          .limit(safeLimit + 1)
          .lean();

        const window = Array.isArray(docs) ? docs : [];
        const hasNext = window.length > safeLimit;
        return { members: window.slice(0, safeLimit), hasNextPage: hasNext };
      },
      5_000,
    );

    // Stored global count to avoid Firestore count aggregations
    const totalMembersStored = await getStoredCount("membersCount");
    const totalPages = Number.isFinite(totalMembersStored)
      ? Math.max(1, Math.ceil(totalMembersStored / safeLimit))
      : null;
    const hasPrevPage = pageNum > 1;

    const responsePayload = {
      success: true,
      data: {
        members,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalMembers: totalMembersStored,
          membersPerPage: safeLimit,
          hasNextPage,
          hasPrevPage,
        },
      },
    };

    membersListCache = { key: cacheKey, value: responsePayload };

    return res.status(200).json(responsePayload);
  } catch (error) {
    // If Firestore quota is exhausted, serve a recent cached response if available.
    if (error?.code === 8) {
      if (membersListCache?.key === cacheKey && membersListCache?.value) {
        res.set("X-Cache", "HIT");
        return res.status(200).json(membersListCache.value);
      }

      const cachedWindow = membersCache.get(cacheKey);
      if (cachedWindow?.members) {
        res.set("X-Cache", "HIT");
        return res.status(200).json({
          success: true,
          data: {
            members: cachedWindow.members,
            pagination: {
              currentPage: pageNum,
              totalPages: null,
              totalMembers: null,
              membersPerPage: safeLimit,
              hasNextPage: Boolean(cachedWindow.hasNextPage),
              hasPrevPage: pageNum > 1,
            },
          },
        });
      }
    }

    return next(error);
  }
};

/**
 * @desc    Get single member by ID
 * @route   GET /api/v1/members/:id
 * @access  Private (Admin or own family member)
 *
 * Matches: PHP mprofile.php (single member view)
 */
export const getMemberById = async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id);

    if (!member) {
      return next(new AppError("Member not found", 404));
    }

    // Authorization: Admin can view all, user can only view own family
    if (req.user.role !== "admin" && member.Mid !== req.user.memberId) {
      return next(new AppError("Not authorized to view this member", 403));
    }

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new member (census entry)
 * @route   POST /api/v1/members
 * @access  Private (User for own family, Admin for any)
 *
 * Matches: PHP membership.php (25-field census form)
 */
export const createMember = async (req, res, next) => {
  try {
    const {
      Mid,
      Fname,
      Dob,
      Gender,
      Relation,
      Mstatus,
      Occupation,
      RC,
      Education,
      Madrassa,
      Aadhaar,
      Mobile,
      Email,
      Health,
      Myear,
      Pward,
      Phouse,
      Dist,
      Area,
      Land,
      House,
      Resident,
      Address,
      Mward,
    } = req.body;

    // Authorization: User can only create for their own family
    if (req.user.role !== "admin" && Mid !== req.user.memberId) {
      return next(
        new AppError("Not authorized to create member for this family", 403),
      );
    }

    // Check if member already exists (duplicate Aadhaar or exact match)
    if (Aadhaar) {
      const existingMember = await Member.findOne({
        Aadhaar: Aadhaar,
        Aadhaar: { $ne: "" }, // Ignore empty aadhaar
      });

      if (existingMember) {
        return next(
          new AppError("Member with this Aadhaar already exists", 400),
        );
      }
    }

    // Create new member
    const member = await Member.create({
      Mid,
      Fname,
      Dob: Dob || new Date("1970-01-01"), // Default for legacy data
      Gender,
      Relation,
      Mstatus,
      Occupation,
      RC,
      Education,
      Madrassa,
      Aadhaar,
      Mobile,
      Email,
      Health,
      Myear,
      Pward,
      Phouse,
      Dist,
      Area,
      Land,
      House,
      Resident,
      Address,
      Mward,
    });

    // Invalidate cached members list
    membersListCache = null;
    await incrementStoredCount("membersCount", 1);

    res.status(201).json({
      success: true,
      message: "Member created successfully",
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update member
 * @route   PUT /api/v1/members/:id
 * @access  Private (User for own family, Admin for any)
 *
 * Matches: PHP edit_membership.php, membership_edit.php
 */
export const updateMember = async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id);

    if (!member) {
      return next(new AppError("Member not found", 404));
    }

    // Authorization: User can only update own family members
    if (req.user.role !== "admin" && member.Mid !== req.user.memberId) {
      return next(new AppError("Not authorized to update this member", 403));
    }

    // Check if updating Aadhaar and it's a duplicate
    if (req.body.Aadhaar && req.body.Aadhaar !== member.Aadhaar) {
      const existingMember = await Member.findOne({
        Aadhaar: req.body.Aadhaar,
        _id: { $ne: req.params.id },
      });

      if (existingMember) {
        return next(
          new AppError("Another member with this Aadhaar already exists", 400),
        );
      }
    }

    // Update member
    const updatedMember = await Member.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );

    // Invalidate cached members list
    membersListCache = null;

    res.status(200).json({
      success: true,
      message: "Member updated successfully",
      data: updatedMember,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete member (soft delete)
 * @route   DELETE /api/v1/members/:id
 * @access  Private (Admin only)
 */
export const deleteMember = async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.id);

    if (!member) {
      return next(new AppError("Member not found", 404));
    }

    // Soft delete by marking as inactive (preserve data integrity)
    member.isActive = false;
    await member.save();

    // Invalidate cached members list
    membersListCache = null;

    res.status(200).json({
      success: true,
      message: "Member deleted successfully",
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search members (advanced search)
 * @route   GET /api/v1/members/search
 * @access  Private
 *
 * Matches: PHP search functionality across site
 */
export const searchMembers = async (req, res, next) => {
  try {
    const { q, type = "all" } = req.query;

    if (!q || q.trim().length === 0) {
      return next(new AppError("Search query is required", 400));
    }

    const searchQuery = q.trim();
    let filter = {};

    // If user (not admin), only search within their family
    if (req.user.role !== "admin") {
      filter.Mid = req.user.memberId;
    }

    // Search type specific
    switch (type) {
      case "name":
        filter.Fname = { $regex: searchQuery, $options: "i" };
        break;
      case "id":
        filter.Mid = { $regex: searchQuery, $options: "i" };
        break;
      case "aadhaar":
        filter.Aadhaar = searchQuery;
        break;
      case "phone":
        filter.Mobile = { $regex: searchQuery, $options: "i" };
        break;
      default:
        // Search all fields
        filter.$or = [
          { Fname: { $regex: searchQuery, $options: "i" } },
          { Mid: { $regex: searchQuery, $options: "i" } },
          { Aadhaar: { $regex: searchQuery, $options: "i" } },
          { Mobile: { $regex: searchQuery, $options: "i" } },
          { Email: { $regex: searchQuery, $options: "i" } },
        ];
    }

    const members = await Member.find(filter)
      .select(
        "Fname Mid Mobile Mward Relation Gender Aadhaar Email createdAt updatedAt isActive",
      )
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      count: members.length,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get family members
 * @route   GET /api/v1/members/family/:familyId
 * @access  Private (User for own family, Admin for any)
 *
 * Matches: PHP functionality showing all family members together
 */
export const getFamilyMembers = async (req, res, next) => {
  try {
    const { familyId } = req.params;
    const safeLimit = Math.min(
      20,
      Math.max(1, parseInt(req.query.limit || 20)),
    );

    // Authorization: User can only view own family
    if (req.user.role !== "admin" && familyId !== req.user.memberId) {
      return next(new AppError("Not authorized to view this family", 403));
    }

    // Get members for this Mid (family ID) with a hard cap
    const members = await Member.find({ Mid: familyId })
      .select(
        "Fname Mid Mobile Mward Relation Gender Aadhaar Email createdAt updatedAt isActive",
      )
      .sort({ createdAt: 1 })
      .limit(safeLimit)
      .lean();

    // Get user info for this family
    const user = await User.findOne({ memberId: familyId }).select("-password");

    res.status(200).json({
      success: true,
      data: {
        user,
        members,
        totalMembers: members.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get member statistics
 * @route   GET /api/v1/members/stats
 * @access  Private (Admin only)
 *
 * Provides analytics for admin dashboard
 */
export const getMemberStats = async (req, res, next) => {
  try {
    // Quota-safe: avoid countDocuments/aggregations. Use stored totals + a cached sample window.
    const payload = await memberStatsCache.wrap(
      "members:stats",
      async () => {
        const totalMembers = await getStoredCount("membersCount");

        const sampleLimit = Math.min(
          500,
          Math.max(50, Number(process.env.MEMBER_STATS_SAMPLE_LIMIT || 300)),
        );
        const sample = await Member.find({})
          .select("Mward Gender Dob Education Land House createdAt")
          .sort({ createdAt: -1 })
          .limit(sampleLimit)
          .lean();

        const membersByWardMap = new Map();
        const membersByGenderMap = new Map();
        const membersByEducationMap = new Map();
        const ageBuckets = [
          { _id: "0-17", count: 0 },
          { _id: "18-29", count: 0 },
          { _id: "30-44", count: 0 },
          { _id: "45-59", count: 0 },
          { _id: "60+", count: 0 },
          { _id: "Unknown", count: 0 },
        ];

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        let recentMembers = 0;
        let landOwners = 0;
        let houseOwners = 0;

        for (const m of sample || []) {
          const ward = String(m.Mward || "Unknown");
          membersByWardMap.set(ward, (membersByWardMap.get(ward) || 0) + 1);

          const gender = String(m.Gender || "Unknown");
          membersByGenderMap.set(
            gender,
            (membersByGenderMap.get(gender) || 0) + 1,
          );

          const edu = String(m.Education || "Unknown");
          membersByEducationMap.set(
            edu,
            (membersByEducationMap.get(edu) || 0) + 1,
          );

          if (m.createdAt && new Date(m.createdAt) >= thirtyDaysAgo)
            recentMembers += 1;
          if (String(m.Land || "").toLowerCase() === "yes") landOwners += 1;
          if (String(m.House || "").toLowerCase() === "yes") houseOwners += 1;

          const dob = m.Dob ? new Date(m.Dob) : null;
          if (!dob || Number.isNaN(dob.getTime())) {
            ageBuckets.find((b) => b._id === "Unknown").count += 1;
          } else {
            const age = Math.floor(
              (Date.now() - dob.getTime()) / (365 * 24 * 60 * 60 * 1000),
            );
            if (age < 18) ageBuckets[0].count += 1;
            else if (age < 30) ageBuckets[1].count += 1;
            else if (age < 45) ageBuckets[2].count += 1;
            else if (age < 60) ageBuckets[3].count += 1;
            else ageBuckets[4].count += 1;
          }
        }

        const membersByWard = [...membersByWardMap.entries()]
          .map(([_id, count]) => ({ _id, count }))
          .sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const membersByGender = [...membersByGenderMap.entries()].map(
          ([_id, count]) => ({ _id, count }),
        );
        const membersByEducation = [...membersByEducationMap.entries()]
          .map(([_id, count]) => ({ _id, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        return {
          success: true,
          data: {
            totalMembers,
            membersByWard,
            membersByGender,
            membersByAge: ageBuckets,
            membersByEducation,
            recentMembers,
            landOwners,
            houseOwners,
            sampleSize: Array.isArray(sample) ? sample.length : 0,
          },
        };
      },
      300_000,
    );

    res.status(200).json(payload);
  } catch (error) {
    // If Firestore quota is exhausted, serve a recent cached response if available.
    if (error?.code === 8) {
      const cached = memberStatsCache.get("members:stats");
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.status(200).json(cached);
      }
    }
    next(error);
  }
};

/**
 * @desc    Bulk import members (for migration/admin use)
 * @route   POST /api/v1/members/import
 * @access  Private (Admin only)
 */
export const importMembers = async (req, res, next) => {
  try {
    const { members } = req.body;

    if (!Array.isArray(members) || members.length === 0) {
      return next(
        new AppError("Please provide an array of members to import", 400),
      );
    }

    // Validate and insert members
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const memberData of members) {
      try {
        // Check for duplicate Aadhaar
        if (memberData.Aadhaar) {
          const existing = await Member.findOne({
            Aadhaar: memberData.Aadhaar,
            Aadhaar: { $ne: "" },
          });
          if (existing) {
            results.failed++;
            results.errors.push({
              member: memberData.Fname,
              error: "Duplicate Aadhaar",
            });
            continue;
          }
        }

        await Member.create(memberData);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          member: memberData.Fname,
          error: error.message,
        });
      }
    }

    // Invalidate cached members list
    membersListCache = null;
    await incrementStoredCount("membersCount", results.success);

    res.status(200).json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get total count of members (for pagination calculation)
 * @route   GET /api/v1/members/count
 * @access  Private
 */
export const getMemberCount = async (req, res, next) => {
  try {
    const { ward, gender, relation } = req.query;

    // Build filter query
    const filter = {};

    // If user (not admin), only count their family members
    if (req.user.role !== "admin") {
      filter.Mid = req.user.memberId;
    }

    // Apply filters if provided
    if (ward) filter.Mward = ward;
    if (gender) filter.Gender = gender;
    if (relation) filter.Relation = relation;

    const cacheKey = `members:count:${req.user?.role}:${req.user?.memberId}:${ward || ""}:${gender || ""}:${relation || ""}`;
    const totalCount = await membersCache.wrap(
      cacheKey,
      async () => Member.countDocuments(filter),
      5_000,
    );

    // Calculate how many pages needed with limit of 100
    const totalPages = Math.ceil(totalCount / 100);

    res.status(200).json({
      success: true,
      data: {
        totalMembers: totalCount,
        totalPages: totalPages,
        itemsPerPage: 100,
      },
    });
  } catch (error) {
    next(error);
  }
};
