/**
 * Inventory Controller
 * Handles all inventory-related operations
 */

import Inventory from "../models/Inventory.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import { logger } from "../utils/logger.js";
import { createTtlCache } from "../utils/ttlCache.js";

// 30-second cache for list results; cleared on every mutation.
const inventoryCache = createTtlCache(30_000);

// @desc    Get all inventory items
// @route   GET /api/v1/inventory
// @access  Private/Admin
export const getInventoryItems = async (req, res) => {
  try {
    const { department } = req.query;
    const cacheKey = `inventory:${department || "all"}`;

    let items = inventoryCache.get(cacheKey);
    if (!items) {
      const filter = { isDeleted: false };
      if (department) filter.department = department;

      items = await Inventory.find(filter)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });
      inventoryCache.set(cacheKey, items);
    }

    res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching inventory items",
      error: error.message,
    });
  }
};

// @desc    Get single inventory item
// @route   GET /api/v1/inventory/:id
// @access  Private/Admin
export const getInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!item || item.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching inventory item",
      error: error.message,
    });
  }
};

// @desc    Create inventory item
// @route   POST /api/v1/inventory
// @access  Private/Admin
export const createInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.create({
      ...req.body,
      isDeleted: false,
      createdBy: req.user._id,
    });

    inventoryCache.clear();
    res.status(201).json({
      success: true,
      data: item,
      message: "Inventory item created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating inventory item",
      error: error.message,
    });
  }
};

// @desc    Update inventory item
// @route   PUT /api/v1/inventory/:id
// @access  Private/Admin
export const updateInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item || item.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    const updatedItem = await Inventory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    inventoryCache.clear();
    res.status(200).json({
      success: true,
      data: updatedItem,
      message: "Inventory item updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating inventory item",
      error: error.message,
    });
  }
};

// @desc    Delete inventory item (soft delete)
// @route   DELETE /api/v1/inventory/:id
// @access  Private/Admin
export const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item || item.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    // Delete associated files from Cloudinary if they exist
    const filesToDelete = [];
    if (item.attachmentUrl) filesToDelete.push(item.attachmentUrl);
    if (item.warrantyUrl) filesToDelete.push(item.warrantyUrl);

    for (const fileUrl of filesToDelete) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = fileUrl.split("/");
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

    item.isDeleted = true;
    await item.save();

    inventoryCache.clear();
    res.status(200).json({
      success: true,
      message: "Inventory item deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting inventory item",
      error: error.message,
    });
  }
};

// @desc    Get inventory statistics
// @route   GET /api/v1/inventory/stats
// @access  Private/Admin
export const getInventoryStats = async (req, res) => {
  try {
    const stats = await Inventory.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
          totalItems: { $sum: "$count" },
        },
      },
    ]);

    const total = await Inventory.countDocuments({ isDeleted: false });

    res.status(200).json({
      success: true,
      data: {
        total,
        byDepartment: stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
};
