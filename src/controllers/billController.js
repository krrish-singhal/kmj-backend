/**
 * Bill Controller
 * Handles all billing and receipt operations
 *
 * PHP Compatibility:
 * - Bill.php (quick pay system)
 * - bill_two.php (alternative billing)
 * - Bill_Print.php (receipt printing)
 * - Bill_accounts_two.php (account management)
 */

import Bill from "../models/Bill.js";
import Member from "../models/Member.js";
import User from "../models/User.js";
import Counter from "../models/Counter.js";
import { getFirestore } from "../config/firebase.js";
import { AggregateField } from "@google-cloud/firestore";
import { COLLECTIONS } from "../db/firestore/collectionNames.js";
import { createTtlCache } from "../utils/ttlCache.js";
import Account from "../models/Account.js";
import EidAnual from "../models/EidAnual.js";
import { AppError } from "../middleware/errorHandler.js";
import { getStoredCount, incrementStoredCount } from "../utils/statsStore.js";
import { logger } from "../utils/logger.js";

const billStatsCache = createTtlCache(30_000);
const billsListCache = createTtlCache(10_000);

/**
 * Account Types (matching old PHP system)
 */
const ACCOUNT_TYPES = [
  "Dua_Friday",
  "Donation",
  "Sunnath Fee",
  "Marriage Fee",
  "Product Turnover",
  "Rental_Basis",
  "Devotional Dedication",
  "Dead Fee",
  "New Membership",
  "Certificate Fee",
  "Eid ul Adha",
  "Eid al-Fitr",
  "Madrassa",
  "Sadhu",
  "Land",
  "Nercha",
];

/**
 * Helper: Get next receipt number
 */
const getNextReceiptNumber = async () => {
  const counter = await Counter.findByIdAndUpdate(
    "bills",
    { $inc: { sequence: 1 } },
    { new: true, upsert: true },
  );
  return counter.sequence;
};

/**
 * Helper: Convert number to words (Indian system)
 */
const numberToWords = (num) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  if (num === 0) return "Zero";

  const numStr = Math.floor(num).toString();
  const decimal = Math.round((num - Math.floor(num)) * 100);

  let words = "";

  // Crores
  if (numStr.length > 7) {
    const crores = parseInt(numStr.slice(0, -7));
    words += convertHundreds(crores) + " Crore ";
  }

  // Lakhs
  if (numStr.length > 5) {
    const lakhs = parseInt(numStr.slice(-7, -5) || 0);
    if (lakhs > 0) words += convertHundreds(lakhs) + " Lakh ";
  }

  // Thousands
  if (numStr.length > 3) {
    const thousands = parseInt(numStr.slice(-5, -3) || 0);
    if (thousands > 0) words += convertHundreds(thousands) + " Thousand ";
  }

  // Hundreds, tens, ones
  const remainder = parseInt(numStr.slice(-3));
  if (remainder > 0) {
    words += convertHundreds(remainder);
  }

  words = words.trim() + " Rupees";

  if (decimal > 0) {
    words += " and " + convertHundreds(decimal) + " Paise";
  }

  return words + " Only";

  function convertHundreds(n) {
    let str = "";
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    }
    if (n >= 10) {
      str += teens[n - 10] + " ";
      return str;
    }
    if (n > 0) {
      str += ones[n] + " ";
    }
    return str;
  }
};

/**
 * @desc    Create new bill/payment
 * @route   POST /api/v1/bills
 * @access  Private (Admin or User for own bills)
 *
 * Matches: PHP Bill.php (quick pay system)
 */
export const createBill = async (req, res, next) => {
  try {
    const {
      mahalId,
      amount,
      accountType,
      paymentMethod = "Cash",
      notes = "",
    } = req.body;

    // Validate account type
    if (!ACCOUNT_TYPES.includes(accountType)) {
      return next(new AppError("Invalid account type", 400));
    }

    // Authorization: User can only create bills for their own family
    if (req.user.role !== "admin" && mahalId !== req.user.memberId) {
      return next(
        new AppError("Not authorized to create bill for this member", 403),
      );
    }

    // Get member details
    const member = await Member.findOne({ Mid: mahalId });
    if (!member) {
      return next(new AppError("Member not found", 404));
    }

    // Get user details
    const user = await User.findOne({ memberId: mahalId });
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    // Generate receipt number
    const receiptNo = await getNextReceiptNumber();

    // Create member address string (matches PHP format)
    const memberAddress = `${member.Fname}\n${member.Address || user.address}\nMahal ID: ${mahalId}\nPhone: ${member.Mobile || user.phone}`;

    // Create bill
    const bill = await Bill.create({
      receiptNo,
      mahalId,
      memberName: member.Fname,
      memberAddress,
      amount: parseFloat(amount),
      amountInWords: numberToWords(parseFloat(amount)),
      accountType,
      paymentMethod,
      notes,
      createdBy: req.user.memberId,
      createdByName: req.user.name,
    });

    await incrementStoredCount("billsCount", 1);

    res.status(201).json({
      success: true,
      message: "Amount Credited Successfully",
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all bills (paginated, filtered)
 * @route   GET /api/v1/bills
 * @access  Private (Admin sees all, User sees own)
 */
export const getAllBills = async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    mahalId = "",
    accountType = "",
    paymentMethod = "",
    startDate = "",
    endDate = "",
    minAmount = "",
    maxAmount = "",
    sortBy = "createdAt",
    sortOrder = "desc",
    cursor = "",
  } = req.query;

  const hasDateRange = Boolean(startDate || endDate);
  const hasAmountRange = Boolean(minAmount || maxAmount);

  const pageNum = Math.max(1, parseInt(page));
  const pageLimit = Math.min(20, Math.max(1, parseInt(limit)));
  const cursorDate = cursor ? new Date(cursor) : null;
  if (cursor && Number.isNaN(cursorDate?.getTime?.())) {
    return next(
      new AppError("Invalid cursor. Expected an ISO date string.", 400),
    );
  }

  // Users can only see their own bills
  const effectiveMahalId =
    req.user?.role === "admin"
      ? String(mahalId || "")
      : String(req.user?.memberId || "");

  const cacheKey = `bills:list:${req.user?.role}:${req.user?.memberId}:${pageNum}:${pageLimit}:${effectiveMahalId}:${accountType}:${paymentMethod}:${startDate}:${endDate}:${minAmount}:${maxAmount}:${sortBy}:${sortOrder}:${cursor || ""}`;

  try {
    const responsePayload = await billsListCache.wrap(cacheKey, async () => {
      const db = getFirestore();

      const buildQuery = (
        { collectionName, dateField, mahalIdField, typeField },
        { includeCursor, includeOrderBy } = {
          includeCursor: true,
          includeOrderBy: true,
        },
      ) => {
        let q = db.collection(collectionName);

        if (effectiveMahalId) {
          q = q.where(mahalIdField, "==", effectiveMahalId);
        }

        if (paymentMethod) {
          q = q.where("paymentMethod", "==", String(paymentMethod));
        }

        if (accountType) {
          q = q.where(typeField, "==", String(accountType));
        }

        if (hasDateRange) {
          if (startDate) q = q.where(dateField, ">=", new Date(startDate));
          if (endDate) q = q.where(dateField, "<=", new Date(endDate));
        }

        // NOTE: amount range filtering is applied in-memory after merge.
        // Firestore can't combine amount-range inequality with date-ordered cursor pagination.

        if (includeCursor && cursorDate) {
          q = q.where(dateField, "<", cursorDate);
        }

        if (includeOrderBy) {
          q = q.orderBy(dateField, sortOrder === "asc" ? "asc" : "desc");
        }

        // Fetch only required fields to reduce payload
        try {
          if (collectionName === COLLECTIONS.bills) {
            q = q.select(
              "receiptNo",
              "amount",
              "paymentMethod",
              "notes",
              "memberId",
              "collectedBy",
              "isActive",
              "createdAt",
              "updatedAt",
              "mahalId",
              "accountType",
              "address",
              "financialYear",
            );
          } else {
            // Accounts / eid docs
            q = q.select(
              "receiptNo",
              "amount",
              "paymentMethod",
              "notes",
              "memberId",
              "collectedBy",
              "isActive",
              "Date",
              "date",
              "createdAt",
              "updatedAt",
              "Mahal_Id",
              "mahal_ID",
              "category",
              "address",
              "financialYear",
              "studentName",
              "class",
              "occasion",
              "purpose",
            );
          }
        } catch {
          // ignore (select may fail on emulator/older SDK)
        }
        return q;
      };

      const perCollectionFetch = Math.min(
        60,
        Math.max(pageLimit + 1, hasAmountRange ? pageLimit * 3 : pageLimit * 2),
      );

      const [billSnap, accountSnap, eidSnap] = await Promise.all([
        buildQuery(
          {
            collectionName: COLLECTIONS.bills,
            dateField: "createdAt",
            mahalIdField: "mahalId",
            typeField: "accountType",
          },
          { includeCursor: true, includeOrderBy: true },
        )
          .limit(perCollectionFetch)
          .get(),
        buildQuery(
          {
            collectionName: COLLECTIONS.accounts,
            dateField: "Date",
            mahalIdField: "Mahal_Id",
            typeField: "category",
          },
          { includeCursor: true, includeOrderBy: true },
        )
          .limit(perCollectionFetch)
          .get(),
        buildQuery(
          {
            collectionName: COLLECTIONS.eidanuals,
            dateField: "date",
            mahalIdField: "mahal_ID",
            typeField: "category",
          },
          { includeCursor: true, includeOrderBy: true },
        )
          .limit(perCollectionFetch)
          .get(),
      ]);

      const normalize = (docId, data, source) => {
        const createdAtRaw = data.createdAt || data.date || data.Date;
        const createdAtVal =
          createdAtRaw && typeof createdAtRaw.toDate === "function"
            ? createdAtRaw.toDate()
            : createdAtRaw;
        return {
          _id: docId,
          receiptNo: data.receiptNo || "N/A",
          amount: data.amount,
          paymentMethod: data.paymentMethod || "Cash",
          notes: data.notes,
          memberId: data.memberId,
          collectedBy: data.collectedBy,
          isActive: data.isActive,
          createdAt: createdAtVal,
          updatedAt: data.updatedAt,
          mahalId: data.mahalId || data.Mahal_Id || data.mahal_ID,
          accountType: data.accountType || data.category,
          category: data.category,
          address: data.address,
          financialYear: data.financialYear,
          _source: source,
          ...(source === "account"
            ? {
                studentName: data.studentName,
                class: data.class,
                occasion: data.occasion,
                purpose: data.purpose,
              }
            : {}),
        };
      };

      const bills = billSnap.docs.map((d) => normalize(d.id, d.data(), "bill"));
      const accounts = accountSnap.docs.map((d) =>
        normalize(d.id, d.data(), "account"),
      );
      const eids = eidSnap.docs.map((d) =>
        normalize(d.id, d.data(), "eidanual"),
      );

      let merged = [...bills, ...accounts, ...eids];
      merged.sort((a, b) => {
        const aVal = a[sortBy] || a.createdAt;
        const bVal = b[sortBy] || b.createdAt;
        if (sortOrder === "asc") return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });

      if (hasAmountRange) {
        const min = minAmount ? parseFloat(minAmount) : null;
        const max = maxAmount ? parseFloat(maxAmount) : null;
        merged = merged.filter((row) => {
          const amt = Number(row.amount);
          if (Number.isNaN(amt)) return false;
          if (min !== null && amt < min) return false;
          if (max !== null && amt > max) return false;
          return true;
        });
      }

      const window = merged.slice(0, pageLimit + 1);
      const paginatedBills = window.slice(0, pageLimit);
      const hasNextPage = window.length > pageLimit;
      const last = paginatedBills[paginatedBills.length - 1];
      const nextCursor =
        hasNextPage && last?.createdAt
          ? new Date(last.createdAt).toISOString()
          : null;

      // Stored count (avoids expensive Firestore count aggregations).
      // NOTE: This tracks only the primary `bills` collection writes done by this app.
      const totalCountStored = await getStoredCount("billsCount");
      const totalCount = Number.isFinite(totalCountStored)
        ? totalCountStored
        : 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageLimit));

      return {
        success: true,
        data: {
          bills: paginatedBills,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalBills: totalCount,
            billsPerPage: pageLimit,
            hasNextPage,
            hasPrevPage: pageNum > 1,
            nextCursor,
          },
        },
      };
    });

    res.status(200).json(responsePayload);
  } catch (error) {
    // If Firestore quota is exhausted, serve a recent cached response if available.
    if (error?.code === 8) {
      const cached = billsListCache.get(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.status(200).json(cached);
      }
    }
    next(error);
  }
};

/**
 * @desc    Get single bill by ID
 * @route   GET /api/v1/bills/:id
 * @access  Private (Admin or own bill)
 */
export const getBillById = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return next(new AppError("Bill not found", 404));
    }

    // Authorization: User can only view own bills
    if (req.user.role !== "admin" && bill.mahalId !== req.user.memberId) {
      return next(new AppError("Not authorized to view this bill", 403));
    }

    res.status(200).json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get bill by receipt number
 * @route   GET /api/v1/bills/receipt/:receiptNo
 * @access  Private
 *
 * Matches: PHP functionality to search by receipt number
 */
export const getBillByReceiptNo = async (req, res, next) => {
  try {
    const receiptNo = parseInt(req.params.receiptNo);
    const bill = await Bill.findOne({ receiptNo });
    if (!bill) {
      return next(new AppError("Bill not found", 404));
    }

    // Authorization: User can only view own bills
    if (req.user.role !== "admin" && bill.mahalId !== req.user.memberId) {
      return next(new AppError("Not authorized to view this bill", 403));
    }

    res.status(200).json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get member's billing history
 * @route   GET /api/v1/bills/member/:mahalId
 * @access  Private (Admin or own bills)
 *
 * Matches: PHP Bill_Print_5View.php (last 5 bills)
 */
export const getMemberBills = async (req, res, next) => {
  try {
    const { mahalId } = req.params;
    const { limit = 5, page = 1 } = req.query;

    // Authorization: User can only view own bills
    if (
      req.user.role !== "admin" &&
      String(mahalId) !== String(req.user.memberId)
    ) {
      return next(new AppError("Not authorized to view these bills", 403));
    }

    const pageNum = Math.max(1, parseInt(page));
    const pageLimit = Math.min(20, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageLimit;

    const db = getFirestore();

    const [docs, aggSnap] = await Promise.all([
      Bill.find({ mahalId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit + 1)
        .lean(),
      db
        .collection(COLLECTIONS.bills)
        .where("mahalId", "==", String(mahalId))
        .aggregate({ total: AggregateField.sum("amount") })
        .get(),
    ]);

    const window = Array.isArray(docs) ? docs : [];
    const hasNextPage = window.length > pageLimit;
    const bills = window.slice(0, pageLimit);

    const totalPaidAmount = Number(aggSnap.data().total || 0);

    res.status(200).json({
      success: true,
      data: {
        bills,
        totalBills: null,
        totalAmountPaid: totalPaidAmount,
        pagination: {
          currentPage: pageNum,
          totalPages: null,
          billsPerPage: pageLimit,
          hasNextPage,
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update bill (admin only, limited fields)
 * @route   PUT /api/v1/bills/:id
 * @access  Private (Admin only)
 */
export const updateBill = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return next(new AppError("Bill not found", 404));
    }

    // Only allow updating notes and payment method (preserve audit trail)
    const { notes, paymentMethod } = req.body;

    if (notes !== undefined) bill.notes = notes;
    if (paymentMethod) bill.paymentMethod = paymentMethod;

    await bill.save();

    res.status(200).json({
      success: true,
      message: "Bill updated successfully",
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete bill (admin only, soft delete)
 * @route   DELETE /api/v1/bills/:id
 * @access  Private (Admin only)
 */
export const deleteBill = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return next(new AppError("Bill not found", 404));
    }

    // Soft delete (preserve financial records)
    bill.isActive = false;
    bill.deletedBy = req.user.memberId;
    bill.deletedAt = new Date();
    await bill.save();

    res.status(200).json({
      success: true,
      message: "Bill deleted successfully",
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get billing statistics
 * @route   GET /api/v1/bills/stats
 * @access  Private (Admin only)
 *
 * Provides analytics for admin dashboard
 */
export const getBillStats = async (req, res, next) => {
  try {
    const { startDate, endDate, accountType } = req.query;

    const cacheKey = `bills:stats:${req.user?.role}:${req.user?.memberId}:${startDate || ""}:${endDate || ""}:${accountType || ""}`;
    const cached = billStatsCache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const db = getFirestore();

    const buildBaseQuery = ({ collectionName, mahalIdField, typeField }) => {
      let q = db.collection(collectionName);

      // Scope to user's own data unless admin
      if (req.user?.role !== "admin" && req.user?.memberId) {
        q = q.where(mahalIdField, "==", String(req.user.memberId));
      }

      if (accountType) {
        q = q.where(typeField, "==", String(accountType));
      }

      return q;
    };

    const buildRangeQuery = ({
      collectionName,
      dateField,
      mahalIdField,
      typeField,
    }) => {
      let q = buildBaseQuery({ collectionName, mahalIdField, typeField });

      if (startDate) q = q.where(dateField, ">=", new Date(startDate));
      if (endDate) q = q.where(dateField, "<=", new Date(endDate));

      return q;
    };

    const aggregateOverview = async (spec) => {
      const snap = await buildRangeQuery(spec)
        .aggregate({
          totalBills: AggregateField.count(),
          totalRevenue: AggregateField.sum("amount"),
        })
        .get();
      const d = snap.data();
      return {
        totalBills: Number(d.totalBills || 0),
        totalRevenue: Number(d.totalRevenue || 0),
      };
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const billSpec = {
      collectionName: COLLECTIONS.bills,
      dateField: "createdAt",
      mahalIdField: "mahalId",
      typeField: "accountType",
    };
    const accountSpec = {
      collectionName: COLLECTIONS.accounts,
      dateField: "Date",
      mahalIdField: "Mahal_Id",
      typeField: "category",
    };
    const eidSpec = {
      collectionName: COLLECTIONS.eidanuals,
      dateField: "date",
      mahalIdField: "mahal_ID",
      typeField: "category",
    };

    const [billOverview, accountOverview, eidOverview] = await Promise.all([
      aggregateOverview(billSpec),
      aggregateOverview(accountSpec),
      aggregateOverview(eidSpec),
    ]);

    const totalBills =
      billOverview.totalBills +
      accountOverview.totalBills +
      eidOverview.totalBills;
    const totalRevenue =
      billOverview.totalRevenue +
      accountOverview.totalRevenue +
      eidOverview.totalRevenue;
    const combinedStats = {
      totalBills,
      totalRevenue,
      avgBillAmount: totalBills > 0 ? totalRevenue / totalBills : 0,
    };

    const sumSince = async (spec, sinceDate) => {
      return buildBaseQuery(spec)
        .where(spec.dateField, ">=", sinceDate)
        .aggregate({ amount: AggregateField.sum("amount") })
        .get()
        .then((s) => Number(s.data().amount || 0));
    };

    const [todayBillsAmt, todayAccountsAmt, todayEidAmt] = await Promise.all([
      sumSince(billSpec, today),
      sumSince(accountSpec, today),
      sumSince(eidSpec, today),
    ]);

    const [monthBillsAmt, monthAccountsAmt, monthEidAmt] = await Promise.all([
      sumSince(billSpec, firstDayOfMonth),
      sumSince(accountSpec, firstDayOfMonth),
      sumSince(eidSpec, firstDayOfMonth),
    ]);

    const responsePayload = {
      success: true,
      data: {
        overview: {
          ...combinedStats,
          todayAmount: todayBillsAmt + todayAccountsAmt + todayEidAmt,
          monthAmount: monthBillsAmt + monthAccountsAmt + monthEidAmt,
        },
        revenueByAccount: [],
      },
    };

    billStatsCache.set(cacheKey, responsePayload, 30_000);
    res.status(200).json(responsePayload);
    return;
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Generate receipt data (for PDF generation)
 * @route   GET /api/v1/bills/:id/receipt
 * @access  Private (Admin or own bill)
 *
 * Matches: PHP Bill_Print.php format
 */
export const getReceiptData = async (req, res, next) => {
  try {
    const billId = req.params.id;

    // Try to find in all three collections
    const [bill, account, eidAnual] = await Promise.all([
      Bill.findById(billId).populate("memberId", "Fname Mid Address").lean(),
      Account.findById(billId).populate("memberId", "Fname Mid Address").lean(),
      EidAnual.findById(billId)
        .populate("memberId", "Fname Mid Address")
        .lean(),
    ]);

    const record = bill || account || eidAnual;

    if (!record) {
      return next(new AppError("Bill/Receipt not found", 404));
    }

    // Normalize the data from different collections
    const mahalId = record.mahalId || record.Mahal_Id || record.mahal_ID;
    const memberName = record.memberId?.Fname || record.memberName || "N/A";
    const memberAddress = record.memberId?.Address || record.address || "N/A";
    const recordDate = record.createdAt || record.date || record.Date;
    const accountType = record.accountType || record.category;

    // Authorization: User can only view own bills
    if (req.user.role !== "admin" && mahalId !== req.user.memberId) {
      return next(new AppError("Not authorized to view this receipt", 403));
    }

    // Convert amount to words (Indian numbering)
    const convertToWords = (num) => {
      const a = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
      ];
      const b = [
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
      ];

      if ((num = num.toString()).length > 9) return "Amount too large";
      const n = ("000000000" + num)
        .substr(-9)
        .match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n) return "";

      let str = "";
      str +=
        n[1] != 0
          ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " Crore "
          : "";
      str +=
        n[2] != 0
          ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " Lakh "
          : "";
      str +=
        n[3] != 0
          ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " Thousand "
          : "";
      str +=
        n[4] != 0
          ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + " Hundred "
          : "";
      str +=
        n[5] != 0
          ? (str != "" ? "and " : "") +
            (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) +
            " Only"
          : "";

      return str.trim();
    };

    const amountInWords = convertToWords(Math.floor(record.amount));

    // Format receipt data (matching PHP Bill_Print.php)
    const receiptData = {
      organizationName: "Kalloor Muslim JamaAth",
      organizationAddress: "Kalloor, Kerala",
      receiptNo: record.receiptNo || "N/A",
      date: new Date(recordDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      time: new Date(recordDate).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      mahalId: mahalId,
      memberName: memberName,
      memberAddress: memberAddress,
      amount: record.amount,
      amountInWords: amountInWords,
      accountType: accountType,
      category: record.category,
      paymentMethod: record.paymentMethod || "Cash",
      notes: record.notes || "",
      financialYear: record.financialYear,
      // Additional fields for different types
      ...(account && {
        studentName: account.studentName,
        class: account.class,
        occasion: account.occasion,
        purpose: account.purpose,
      }),
      collectedBy: record.collectedBy,
      _source: bill ? "bill" : account ? "account" : "eidanual",
    };

    res.status(200).json({
      success: true,
      data: receiptData,
    });
  } catch (error) {
    logger.error(
      "getReceiptData failed: %s",
      error?.message || "unknown error",
    );
    next(error);
  }
};
