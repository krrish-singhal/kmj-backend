/**
 * Land Controller
 * Handles all land-related operations
 */

import Land from "../models/Land.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import { logger } from "../utils/logger.js";

// @desc    Get all land records
// @route   GET /api/v1/lands
// @access  Private/Admin
export const getLands = async (req, res) => {
  try {
    const { ward } = req.query;

    const filter = { isDeleted: false };
    if (ward) filter.ward = ward;

    const lands = await Land.find(filter)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: lands.length,
      data: lands,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching land records",
      error: error.message,
    });
  }
};

// @desc    Get single land record
// @route   GET /api/v1/lands/:id
// @access  Private/Admin
export const getLand = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!land || land.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    res.status(200).json({
      success: true,
      data: land,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching land record",
      error: error.message,
    });
  }
};

// @desc    Create land record
// @route   POST /api/v1/lands
// @access  Private/Admin
export const createLand = async (req, res) => {
  try {
    const { name, area, ward, attachmentUrl } = req.body;

    const land = await Land.create({
      name,
      area,
      ward,
      attachmentUrl,
      isDeleted: false,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: land,
      message: "Land record created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating land record",
      error: error.message,
    });
  }
};

// @desc    Update land record
// @route   PUT /api/v1/lands/:id
// @access  Private/Admin
export const updateLand = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);

    if (!land || land.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    const updatedLand = await Land.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: updatedLand,
      message: "Land record updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating land record",
      error: error.message,
    });
  }
};

// @desc    Delete land record (soft delete)
// @route   DELETE /api/v1/lands/:id
// @access  Private/Admin
export const deleteLand = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);

    if (!land || land.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    // Delete associated file from Cloudinary if exists
    if (land.attachmentUrl) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = land.attachmentUrl.split("/");
        const uploadIndex = urlParts.indexOf("upload");
        if (uploadIndex !== -1) {
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join("/");
          const publicId = publicIdWithExt.substring(
            0,
            publicIdWithExt.lastIndexOf("."),
          );
          await deleteFromCloudinary(publicId);
        }
      } catch (deleteError) {
        logger.warn(
          "Cloudinary delete failed: %s",
          deleteError?.message || "unknown error",
        );
        // Continue with deletion even if file deletion fails
      }
    }

    land.isDeleted = true;
    await land.save();

    res.status(200).json({
      success: true,
      message: "Land record deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting land record",
      error: error.message,
    });
  }
};
