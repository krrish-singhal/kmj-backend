/**
 * Bill Routes
 * All routes for billing and receipt management
 */

import express from 'express';
import { verifyToken, authorize } from '../middleware/auth.js';
import { 
  validateBillCreation,
  validatePagination,
  validateObjectId 
} from '../middleware/validate.js';
import {
  createBill,
  getAllBills,
  getBillById,
  getBillByReceiptNo,
  getMemberBills,
  updateBill,
  deleteBill,
  getReceiptData
} from '../controllers/billController.js';
import { testCollections } from '../controllers/testController.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Test endpoint to check collections
router.get('/test-collections', testCollections);

/**
 * @route   GET /api/v1/bills
 * @desc    Get all bills (paginated, filtered)
 * @access  Private (Admin sees all, User sees own)
 * 
 * Query params:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20)
 * - mahalId: Filter by Mahal ID
 * - accountType: Filter by account type
 * - startDate: Filter from date (ISO format)
 * - endDate: Filter to date (ISO format)
 * - sortBy: Sort field (default 'createdAt')
 * - sortOrder: Sort order (default 'desc')
 */
router.get('/', validatePagination, getAllBills);

/**
 * @route   GET /api/v1/bills/stats
 * @desc    Get billing statistics
 * @access  Private (Admin only)
 * 
 * Query params:
 * - startDate: Filter from date
 * - endDate: Filter to date
 */
// Disabled temporarily to reduce Firestore load
// router.get('/stats', authorize('admin'), getBillStats);

/**
 * @route   GET /api/v1/bills/receipt/:receiptNo
 * @desc    Get bill by receipt number
 * @access  Private
 */
router.get('/receipt/:receiptNo', getBillByReceiptNo);

/**
 * @route   GET /api/v1/bills/member/:mahalId
 * @desc    Get member's billing history
 * @access  Private (Admin or own bills)
 * 
 * Query params:
 * - limit: Number of bills (default 5)
 * - page: Page number (default 1)
 * 
 * Matches: PHP Bill_Print_5View.php (last 5 bills)
 */
router.get('/member/:mahalId', getMemberBills);

/**
 * @route   POST /api/v1/bills
 * @desc    Create new bill/payment
 * @access  Private (Admin or User for own bills)
 * 
 * Body:
 * - mahalId: Mahal ID (required)
 * - amount: Payment amount (required, > 0)
 * - accountType: Account type (required, one of 16 types)
 * - paymentMethod: Payment method (default 'Cash')
 * - notes: Additional notes
 * 
 * Account Types:
 * - Dua_Friday
 * - Donation
 * - Sunnath Fee
 * - Marriage Fee
 * - Product Turnover
 * - Rental_Basis
 * - Devotional Dedication
 * - Dead Fee
 * - New Membership
 * - Certificate Fee
 * - Eid ul Adha
 * - Eid al-Fitr
 * - Madrassa
 * - Sadhu
 * - Land
 * - Nercha
 * 
 * Matches: PHP Bill.php (quick pay system)
 */
router.post('/', validateBillCreation, createBill);

/**
 * @route   GET /api/v1/bills/:id/receipt
 * @desc    Get receipt data for PDF generation
 * @access  Private (Admin or own bill)
 * 
 * Matches: PHP Bill_Print.php format
 */
router.get('/:id/receipt', validateObjectId, getReceiptData);

/**
 * @route   GET /api/v1/bills/:id
 * @desc    Get single bill by ID
 * @access  Private (Admin or own bill)
 */
router.get('/:id', validateObjectId, getBillById);

/**
 * @route   PUT /api/v1/bills/:id
 * @desc    Update bill (limited fields)
 * @access  Private (Admin only)
 * 
 * Body:
 * - notes: Additional notes
 * - paymentMethod: Payment method
 */
router.put('/:id', validateObjectId, authorize('admin'), updateBill);

/**
 * @route   DELETE /api/v1/bills/:id
 * @desc    Delete bill (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id', validateObjectId, authorize('admin'), deleteBill);

export default router;
