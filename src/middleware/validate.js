/**
 * Input Validation Middleware
 * Using express-validator for request validation
 */

import { body, param, query, validationResult } from "express-validator";

/**
 * Handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.path || err.param,
        message: err.msg,
      })),
    });
  }

  next();
};

/**
 * Registration validation rules
 * Matches old PHP registration form
 */
export const validateRegistration = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters"),

  body("address")
    .trim()
    .notEmpty()
    .withMessage("Address is required")
    .isLength({ max: 500 })
    .withMessage("Address cannot exceed 500 characters"),

  body("aadhaar")
    .trim()
    .notEmpty()
    .withMessage("Aadhaar number is required")
    .matches(/^[0-9]{12}$/)
    .withMessage("Aadhaar must be exactly 12 digits"),

  body("ward")
    .trim()
    .notEmpty()
    .withMessage("Ward number is required")
    .matches(/^[0-9]+$/)
    .withMessage("Ward must be a number"),

  body("houseNo").trim().notEmpty().withMessage("House number is required"),

  body("phone")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{10}$/)
    .withMessage("Phone must be 10 digits"),

  handleValidationErrors,
];

/**
 * Login validation rules
 */
export const validateLogin = [
  body("memberId")
    .trim()
    .notEmpty()
    .withMessage("Member ID is required")
    .custom((value) => {
      const v = String(value || "").trim();
      // Accept: 1/74, 1/74A, ADMIN/001, TEMP/anything
      const ok = /^(?:\d+\/[A-Za-z0-9_-]+|ADMIN\/\d+|TEMP\/.+)$/i.test(v);
      if (!ok) {
        throw new Error(
          "Member ID format should be ward/house (e.g., 1/74), ADMIN/001, or TEMP/NAME",
        );
      }
      return true;
    }),

  body("password").trim().notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

/**
 * Password change validation
 */
export const validatePasswordChange = [
  body("currentPassword")
    .trim()
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .trim()
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  body("confirmPassword")
    .trim()
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),

  handleValidationErrors,
];

/**
 * Member census form validation
 * Matches old PHP census form (25 fields)
 */
export const validateMemberCensus = [
  body("Mid")
    .trim()
    .notEmpty()
    .withMessage("Mahal ID is required")
    .matches(/^(\d+\/\d+|TEMP\/.+)$/)
    .withMessage("Invalid Mahal ID format"),

  body("Fname")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("Dob")
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage("Invalid date format"),

  body("Gender")
    .trim()
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["Male", "Female", "Other"])
    .withMessage("Invalid gender"),

  body("Mobile")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{10}$/)
    .withMessage("Mobile must be 10 digits"),

  body("Email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Invalid email format"),

  body("Aadhaar")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{12}$/)
    .withMessage("Aadhaar must be 12 digits"),

  body("Myear")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{4}$/)
    .withMessage("Year must be 4 digits"),

  body("Address")
    .optional({ checkFalsy: true })
    .isLength({ max: 500 })
    .withMessage("Address cannot exceed 500 characters"),

  handleValidationErrors,
];

/**
 * Bill creation validation
 * Matches old PHP billing system
 */
export const validateBillCreation = [
  body("mahal_ID")
    .trim()
    .notEmpty()
    .withMessage("Mahal ID is required")
    .matches(/^(\d+\/\d+|TEMP\/.+)$/)
    .withMessage("Invalid Mahal ID format"),

  body("id_name_address")
    .trim()
    .notEmpty()
    .withMessage("Member details are required"),

  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be greater than 0")
    .toFloat(),

  body("type")
    .trim()
    .notEmpty()
    .withMessage("Account type is required")
    .isIn([
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
      "General",
    ])
    .withMessage("Invalid account type"),

  body("paymentMethod")
    .optional({ checkFalsy: true })
    .isIn(["cash", "card", "upi", "bank_transfer"])
    .withMessage("Invalid payment method"),

  handleValidationErrors,
];

/**
 * Specialized account validation (Land, Madrassa, Nercha, Sadhu)
 */
export const validateAccountEntry = [
  body("Mahal_Id")
    .trim()
    .notEmpty()
    .withMessage("Mahal ID is required")
    .matches(/^(\d+\/\d+|TEMP\/.+)$/)
    .withMessage("Invalid Mahal ID format"),

  body("Fname")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("Tariff")
    .notEmpty()
    .withMessage("Tariff amount is required")
    .isFloat({ min: 0 })
    .withMessage("Tariff must be a valid number")
    .toFloat(),

  body("Status")
    .optional({ checkFalsy: true })
    .isIn(["Active", "Inactive", "Pending"])
    .withMessage("Invalid status"),

  handleValidationErrors,
];

/**
 * Notice creation validation
 */
export const validateNotice = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),

  body("content")
    .trim()
    .notEmpty()
    .withMessage("Content is required")
    .isLength({ max: 5000 })
    .withMessage("Content cannot exceed 5000 characters"),

  body("priority")
    .optional({ checkFalsy: true })
    .isIn(["low", "medium", "high", "urgent"])
    .withMessage("Invalid priority"),

  body("expiryDate")
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage("Invalid expiry date format"),

  handleValidationErrors,
];

/**
 * Document ID validation
 *
 * Historically this API used MongoDB ObjectIds. With Firestore, document IDs can
 * be arbitrary URL-safe strings. We keep compatibility with 24-hex ObjectIds.
 */
export const validateObjectId = [
  param("id")
    .matches(/^(?:[0-9a-fA-F]{24}|[A-Za-z0-9_-]{3,128})$/)
    .withMessage("Invalid ID format"),

  handleValidationErrors,
];

/**
 * Pagination validation
 */
export const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("sortBy").optional().trim(),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Sort order must be asc or desc"),

  handleValidationErrors,
];

/**
 * Search validation
 */
export const validateSearch = [
  query("q")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Search query must be at least 2 characters"),

  query("field")
    .optional()
    .trim()
    .isIn(["name", "memberId", "aadhaar", "phone", "all"])
    .withMessage("Invalid search field"),

  handleValidationErrors,
];

/**
 * User update validation
 */
export const validateUserUpdate = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters"),

  body("phone")
    .optional()
    .matches(/^[0-9]{10}$/)
    .withMessage("Phone must be 10 digits"),

  body("email").optional().isEmail().withMessage("Invalid email format"),

  body("address")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Address cannot exceed 500 characters"),

  handleValidationErrors,
];

/**
 * Notice Creation Validation
 */
export const validateNoticeCreation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),

  body("content")
    .trim()
    .notEmpty()
    .withMessage("Content is required")
    .isLength({ max: 5000 })
    .withMessage("Content cannot exceed 5000 characters"),

  body("priority")
    .optional()
    .isIn(["urgent", "high", "normal", "low"])
    .withMessage("Priority must be urgent, high, normal, or low"),

  body("expiresAt")
    .optional()
    .isISO8601()
    .withMessage("Invalid expiration date format"),

  handleValidationErrors,
];
