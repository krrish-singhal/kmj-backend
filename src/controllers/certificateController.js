/**
 * Certificate Controller
 * Handles all certificate-related operations
 */

import Certificate from "../models/Certificate.js";

// @desc    Get all certificates
// @route   GET /api/v1/certificates
// @access  Private/Admin
export const getCertificates = async (req, res) => {
  try {
    const { type } = req.query;

    const filter = { isDeleted: false };
    if (type) filter.type = type;

    const certificates = await Certificate.find(filter)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching certificates",
      error: error.message,
    });
  }
};

// @desc    Get single certificate
// @route   GET /api/v1/certificates/:id
// @access  Private/Admin
export const getCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!certificate || certificate.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching certificate",
      error: error.message,
    });
  }
};

// @desc    Create certificate
// @route   POST /api/v1/certificates
// @access  Private/Admin
export const createCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.create({
      ...req.body,
      isDeleted: false,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: certificate,
      message: "Certificate created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating certificate",
      error: error.message,
    });
  }
};

// @desc    Update certificate
// @route   PUT /api/v1/certificates/:id
// @access  Private/Admin
export const updateCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);

    if (!certificate || certificate.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    const updatedCertificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      data: updatedCertificate,
      message: "Certificate updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating certificate",
      error: error.message,
    });
  }
};

// @desc    Delete certificate (soft delete)
// @route   DELETE /api/v1/certificates/:id
// @access  Private/Admin
export const deleteCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);

    if (!certificate || certificate.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    certificate.isDeleted = true;
    await certificate.save();

    res.status(200).json({
      success: true,
      message: "Certificate deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting certificate",
      error: error.message,
    });
  }
};

// @desc    Get certificate statistics
// @route   GET /api/v1/certificates/stats
// @access  Private/Admin
export const getCertificateStats = async (req, res) => {
  try {
    const stats = await Certificate.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await Certificate.countDocuments({ isDeleted: false });

    res.status(200).json({
      success: true,
      data: {
        total,
        byType: stats,
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
