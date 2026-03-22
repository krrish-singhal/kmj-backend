/**
 * Notice Controller
 * Handles notice board operations - Simplified version
 */

import Notice from '../models/Notice.js';
import { AppError } from '../middleware/errorHandler.js';
import { createTtlCache } from '../utils/ttlCache.js';

const noticesCache = createTtlCache(10_000);

/**
 * @desc    Get all active (non-expired) notices
 * @route   GET /api/v1/notices
 * @access  Public
 */
export const getAllNotices = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, includeExpired = 'false' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `notices:${pageNum}:${limitNum}:${includeExpired}`;

    const payload = await noticesCache.wrap(
      cacheKey,
      async () => {
        // IMPORTANT: Avoid Firestore inequality scans + countDocuments on large collections.
        // Fetch a small window of recent notices and filter expired in-memory.
        const windowSize = Math.min(200, skip + limitNum + 50);
        let notices = await Notice.find({})
          .sort({ createdAt: -1 })
          .limit(windowSize)
          .populate('author', 'username email')
          .lean();

        if (includeExpired === 'false') {
          const now = new Date();
          notices = notices.filter((n) => !n.expiryDate || new Date(n.expiryDate) >= now);
        }

        const paged = notices.slice(skip, skip + limitNum);

        return {
          success: true,
          data: {
            notices: paged,
            pagination: {
              currentPage: pageNum,
              // Total count intentionally omitted to avoid quota-heavy scans.
              totalPages: null,
              totalNotices: null,
              noticesPerPage: limitNum,
            },
          },
        };
      },
      10_000
    );

    res.status(200).json(payload);
  } catch (error) {
    // If Firestore quota is exhausted, serve a recent cached response if available.
    if (error?.code === 8) {
      try {
        const { page = 1, limit = 10, includeExpired = 'false' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const cacheKey = `notices:${pageNum}:${limitNum}:${includeExpired}`;
        const cached = noticesCache.get(cacheKey);
        if (cached) {
          res.set('X-Cache', 'HIT');
          return res.status(200).json(cached);
        }
      } catch {
        // fall through
      }
    }
    next(error);
  }
};

/**
 * @desc    Get single notice by ID
 * @route   GET /api/v1/notices/:id
 * @access  Public
 */
export const getNoticeById = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id)
      .populate('author', 'username email');

    if (!notice) {
      return next(new AppError('Notice not found', 404));
    }

    res.status(200).json({
      success: true,
      data: notice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new notice
 * @route   POST /api/v1/notices
 * @access  Private (Admin only)
 */
export const createNotice = async (req, res, next) => {
  try {
    const { title, content, expiryDate } = req.body;

    if (!title || !content || !expiryDate) {
      return next(new AppError('Please provide title, content, and expiry date', 400));
    }

    // Create notice with author from authenticated user
    const notice = await Notice.create({
      title,
      content,
      expiryDate: new Date(expiryDate),
      author: req.user.id || req.user._id
    });

    // Populate author details
    await notice.populate('author', 'username email');

    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: notice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update notice
 * @route   PUT /api/v1/notices/:id
 * @access  Private (Admin only)
 */
export const updateNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return next(new AppError('Notice not found', 404));
    }

    const { title, content, expiryDate } = req.body;

    if (title !== undefined) notice.title = title;
    if (content !== undefined) notice.content = content;
    if (expiryDate !== undefined) notice.expiryDate = new Date(expiryDate);

    await notice.save();

    // Populate author details
    await notice.populate('author', 'username email');

    res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: notice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete notice
 * @route   DELETE /api/v1/notices/:id
 * @access  Private (Admin only)
 */
export const deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);

    if (!notice) {
      return next(new AppError('Notice not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Notice deleted successfully',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Increment notice view count
 * @route   POST /api/v1/notices/:id/view
 * @access  Public
 */
export const incrementViews = async (req, res, next) => {
  try {
    const notice = await Notice.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!notice) {
      return next(new AppError('Notice not found', 404));
    }

    res.status(200).json({
      success: true,
      data: { views: notice.views }
    });
  } catch (error) {
    next(error);
  }
};

