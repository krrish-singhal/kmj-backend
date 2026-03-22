/**
 * Notice Routes
 * All routes for notice board management
 */

import express from 'express';
import { verifyToken, authorize, optionalAuth } from '../middleware/auth.js';
import { validateNoticeCreation, validateObjectId } from '../middleware/validate.js';
import {
  getAllNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
  incrementViews
} from '../controllers/noticeController.js';

const router = express.Router();

/**
 * @route   GET /api/v1/notices
 * @desc    Get all active notices
 * @access  Public
 * 
 * Query params:
 * - page: Page number (default 1)
 * - limit: Items per page (default 10)
 * - priority: Filter by priority (urgent|high|normal|low)
 * 
 * Matches: PHP index.php notice board
 */
router.get('/', getAllNotices);

/**
 * @route   GET /api/v1/notices/:id
 * @desc    Get single notice by ID
 * @access  Public
 * 
 * Matches: PHP Pageinfo.php
 */
router.get('/:id', validateObjectId, getNoticeById);

/**
 * @route   POST /api/v1/notices/:id/view
 * @desc    Increment notice view count
 * @access  Public
 */
router.post('/:id/view', validateObjectId, incrementViews);

/**
 * @route   POST /api/v1/notices
 * @desc    Create new notice
 * @access  Private (Admin only)
 * 
 * Body:
 * - title: Notice title (required, max 200 chars)
 * - content: Notice content (required)
 * - priority: Priority level (urgent|high|normal|low, default 'normal')
 * - expiresAt: Expiration date (optional)
 */
router.post('/', verifyToken, authorize('admin'), validateNoticeCreation, createNotice);

/**
 * @route   PUT /api/v1/notices/:id
 * @desc    Update notice
 * @access  Private (Admin only)
 * 
 * Body:
 * - title: Notice title
 * - content: Notice content
 * - priority: Priority level
 * - expiresAt: Expiration date
 * - isActive: Active status
 */
router.put('/:id', verifyToken, authorize('admin'), validateObjectId, updateNotice);

/**
 * @route   DELETE /api/v1/notices/:id
 * @desc    Delete notice (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id', verifyToken, authorize('admin'), validateObjectId, deleteNotice);

export default router;
