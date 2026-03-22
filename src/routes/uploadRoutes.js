/**
 * Upload Routes
 * Handles file uploads to Cloudinary
 */

import express from 'express';
import { uploadDocument } from '../config/cloudinary.js';
import { verifyToken } from '../middleware/auth.js';
import { uploadFile, uploadMultipleFiles, deleteFile } from '../controllers/uploadController.js';

const router = express.Router();

/**
 * @route   POST /api/v1/upload/single
 * @desc    Upload a single file
 * @access  Private
 */
router.post('/single', verifyToken, uploadDocument.single('file'), uploadFile);

/**
 * @route   POST /api/v1/upload/multiple
 * @desc    Upload multiple files
 * @access  Private
 */
router.post('/multiple', verifyToken, uploadDocument.array('files', 5), uploadMultipleFiles);

/**
 * @route   DELETE /api/v1/upload/:publicId
 * @desc    Delete a file from Cloudinary
 * @access  Private
 */
router.delete('/:publicId', verifyToken, deleteFile);

export default router;
