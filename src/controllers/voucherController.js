/**
 * Voucher Controller
 * Handles all voucher-related operations
 */

import Voucher from "../models/Voucher.js";
import { createTtlCache } from "../utils/ttlCache.js";

// 30-second cache for list results; cleared on every mutation.
const voucherCache = createTtlCache(30_000);

// @desc    Get all vouchers
// @route   GET /api/v1/vouchers
// @access  Private/Admin
export const getVouchers = async (req, res) => {
  try {
    const { service, startDate, endDate } = req.query;
    const cacheKey = `vouchers:${service || "all"}:${startDate || ""}:${endDate || ""}`;

    let vouchers = voucherCache.get(cacheKey);
    if (!vouchers) {
      const filter = { isDeleted: false };
      if (service) filter.service = service;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      vouchers = await Voucher.find(filter)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });
      voucherCache.set(cacheKey, vouchers);
    }

    res.status(200).json({
      success: true,
      count: vouchers.length,
      data: vouchers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vouchers",
      error: error.message,
    });
  }
};

// @desc    Get single voucher
// @route   GET /api/v1/vouchers/:id
// @access  Private/Admin
export const getVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!voucher || voucher.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    res.status(200).json({
      success: true,
      data: voucher,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching voucher",
      error: error.message,
    });
  }
};

// @desc    Create voucher
// @route   POST /api/v1/vouchers
// @access  Private/Admin
export const createVoucher = async (req, res) => {
  try {
    const { name, address, cost, service } = req.body;

    const voucher = await Voucher.create({
      name,
      address,
      cost,
      service,
      isDeleted: false,
      createdBy: req.user._id,
    });

    voucherCache.clear();
    res.status(201).json({
      success: true,
      data: voucher,
      message: "Voucher created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating voucher",
      error: error.message,
    });
  }
};

// @desc    Update voucher
// @route   PUT /api/v1/vouchers/:id
// @access  Private/Admin
export const updateVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher || voucher.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    const updatedVoucher = await Voucher.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    voucherCache.clear();
    res.status(200).json({
      success: true,
      data: updatedVoucher,
      message: "Voucher updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating voucher",
      error: error.message,
    });
  }
};

// @desc    Delete voucher (soft delete)
// @route   DELETE /api/v1/vouchers/:id
// @access  Private/Admin
export const deleteVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher || voucher.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    voucher.isDeleted = true;
    await voucher.save();

    voucherCache.clear();
    res.status(200).json({
      success: true,
      message: "Voucher deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting voucher",
      error: error.message,
    });
  }
};

// @desc    Get voucher statistics
// @route   GET /api/v1/vouchers/stats
// @access  Private/Admin
export const getVoucherStats = async (req, res) => {
  try {
    const stats = await Voucher.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$service",
          count: { $sum: 1 },
          totalCost: { $sum: "$cost" },
        },
      },
    ]);

    const total = await Voucher.countDocuments({ isDeleted: false });
    const totalRevenue = await Voucher.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: "$cost" } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        totalRevenue: totalRevenue[0]?.total || 0,
        byService: stats,
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
