/**
 * Report Controller
 * Handles all report/complaint-related operations
 */

import Report from "../models/Report.js";

// @desc    Get all reports
// @route   GET /api/v1/reports
// @access  Private/Admin
export const getReports = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = { isDeleted: false };
    if (status) filter.status = status;

    const reports = await Report.find(filter)
      .populate("createdBy", "name email")
      .populate("inventoryItem", "name department")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reports",
      error: error.message,
    });
  }
};

// @desc    Get single report
// @route   GET /api/v1/reports/:id
// @access  Private/Admin
export const getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("inventoryItem", "name department");

    if (!report || report.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching report",
      error: error.message,
    });
  }
};

// @desc    Create report
// @route   POST /api/v1/reports
// @access  Private/Admin
export const createReport = async (req, res) => {
  try {
    const report = await Report.create({
      ...req.body,
      isDeleted: false,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: report,
      message: "Report created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating report",
      error: error.message,
    });
  }
};

// @desc    Update report
// @route   PUT /api/v1/reports/:id
// @access  Private/Admin
export const updateReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report || report.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // If status is being changed to Resolved, set resolvedAt
    if (req.body.status === "Resolved" && report.status !== "Resolved") {
      req.body.resolvedAt = new Date();
    }

    const updatedReport = await Report.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      data: updatedReport,
      message: "Report updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating report",
      error: error.message,
    });
  }
};

// @desc    Delete report (soft delete)
// @route   DELETE /api/v1/reports/:id
// @access  Private/Admin
export const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report || report.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    report.isDeleted = true;
    await report.save();

    res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting report",
      error: error.message,
    });
  }
};

// @desc    Get report statistics
// @route   GET /api/v1/reports/stats
// @access  Private/Admin
export const getReportStats = async (req, res) => {
  try {
    const stats = await Report.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await Report.countDocuments({ isDeleted: false });

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus: stats,
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
