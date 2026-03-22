/**
 * Upload Controller
 * Handles file upload operations
 */

import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";

/**
 * @desc    Upload a single file
 * @route   POST /api/v1/upload/single
 * @access  Private
 */
export const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError("No file uploaded", 400));
    }

    logger.info(`File uploaded successfully: ${req.file.originalname}`);

    // Support both Cloudinary storage (req.file.url/public_id)
    // and local disk storage (req.file.filename/path)
    const publicId = req.file.public_id || req.file.filename || null;
    const url =
      req.file.url ||
      (req.file.filename
        ? `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(req.file.filename)}`
        : null);

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        url,
        public_id: publicId,
        originalname: req.file.originalname,
        size: req.file.size,
        format: req.file.format,
      },
    });
  } catch (error) {
    logger.error("Error uploading file:", error);
    next(error);
  }
};

/**
 * @desc    Upload multiple files
 * @route   POST /api/v1/upload/multiple
 * @access  Private
 */
export const uploadMultipleFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(new AppError("No files uploaded", 400));
    }

    logger.info(`${req.files.length} files uploaded successfully`);

    const uploadedFiles = req.files.map((file) => {
      const publicId = file.public_id || file.filename || null;
      const url =
        file.url ||
        (file.filename
          ? `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(file.filename)}`
          : null);

      return {
        url,
        public_id: publicId,
        originalname: file.originalname,
        size: file.size,
        format: file.format,
      };
    });

    res.status(200).json({
      success: true,
      message: `${req.files.length} files uploaded successfully`,
      data: uploadedFiles,
    });
  } catch (error) {
    logger.error("Error uploading files:", error);
    next(error);
  }
};

/**
 * @desc    Delete a file from Cloudinary
 * @route   DELETE /api/v1/upload/:publicId
 * @access  Private
 */
export const deleteFile = async (req, res, next) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return next(new AppError("Public ID is required", 400));
    }

    // Decode the publicId (it comes URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    logger.info(`Deleting file from Cloudinary: ${decodedPublicId}`);

    await deleteFromCloudinary(decodedPublicId);

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting file:", error);
    next(error);
  }
};
