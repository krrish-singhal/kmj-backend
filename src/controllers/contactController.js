/**
 * Contact Controller
 * Handles all contact-related operations
 */

import Contact from "../models/Contact.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import { logger } from "../utils/logger.js";
import { createTtlCache } from "../utils/ttlCache.js";

// 30-second cache for contact lists; cleared on every mutation.
const contactsCache = createTtlCache(30_000);

// @desc    Get all contacts
// @route   GET /api/v1/contacts
// @access  Private/Admin
export const getContacts = async (req, res) => {
  try {
    const { search } = req.query;
    const cacheKey = `contacts:${search || "all"}`;

    let contacts = contactsCache.get(cacheKey);
    if (!contacts) {
      const filter = { isDeleted: false };
      let query = Contact.find(filter);

      // Text search
      if (search) {
        query = Contact.find({ ...filter, $text: { $search: search } });
      }

      contacts = await query
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });
      contactsCache.set(cacheKey, contacts);
    }

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    logger.error("Error fetching contacts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching contacts",
      error: error.message,
    });
  }
};

// @desc    Get single contact
// @route   GET /api/v1/contacts/:id
// @access  Private/Admin
export const getContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!contact || contact.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    res.status(200).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    logger.error("Error fetching contact:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching contact",
      error: error.message,
    });
  }
};

// @desc    Create contact
// @route   POST /api/v1/contacts
// @access  Private/Admin
export const createContact = async (req, res) => {
  try {
    const { name, title, phoneNumber, warrantyFiles } = req.body;

    const contact = await Contact.create({
      name,
      title,
      phoneNumber,
      warrantyFiles: warrantyFiles || [],
      isDeleted: false,
      createdBy: req.user._id,
    });

    logger.info(`Contact created: ${contact._id} by user ${req.user._id}`);

    contactsCache.clear();
    res.status(201).json({
      success: true,
      data: contact,
      message: "Contact created successfully",
    });
  } catch (error) {
    logger.error("Error creating contact:", error);
    res.status(400).json({
      success: false,
      message: "Error creating contact",
      error: error.message,
    });
  }
};

// @desc    Update contact
// @route   PUT /api/v1/contacts/:id
// @access  Private/Admin
export const updateContact = async (req, res) => {
  try {
    const { name, title, phoneNumber, warrantyFiles } = req.body;

    const contact = await Contact.findById(req.params.id);

    if (!contact || contact.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    // Update fields
    if (name !== undefined) contact.name = name;
    if (title !== undefined) contact.title = title;
    if (phoneNumber !== undefined) contact.phoneNumber = phoneNumber;
    if (warrantyFiles !== undefined) contact.warrantyFiles = warrantyFiles;

    await contact.save();

    logger.info(`Contact updated: ${contact._id} by user ${req.user._id}`);

    contactsCache.clear();
    res.status(200).json({
      success: true,
      data: contact,
      message: "Contact updated successfully",
    });
  } catch (error) {
    logger.error("Error updating contact:", error);
    res.status(400).json({
      success: false,
      message: "Error updating contact",
      error: error.message,
    });
  }
};

// @desc    Delete contact (soft delete)
// @route   DELETE /api/v1/contacts/:id
// @access  Private/Admin
export const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    contact.isDeleted = true;
    await contact.save();

    logger.info(`Contact deleted: ${contact._id} by user ${req.user._id}`);

    contactsCache.clear();
    res.status(200).json({
      success: true,
      message: "Contact deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting contact:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting contact",
      error: error.message,
    });
  }
};

// @desc    Delete warranty file
// @route   DELETE /api/v1/contacts/:id/files/:fileId
// @access  Private/Admin
export const deleteWarrantyFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;

    const contact = await Contact.findById(id);

    if (!contact || contact.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    // fileId is actually the index in the array
    const fileIndex = parseInt(fileId);

    if (fileIndex < 0 || fileIndex >= contact.warrantyFiles.length) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const fileUrl = contact.warrantyFiles[fileIndex];

    // Extract public_id from Cloudinary URL and delete
    if (fileUrl) {
      try {
        // Extract public_id from URL
        const urlParts = fileUrl.split("/");
        const uploadIndex = urlParts.indexOf("upload");
        if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
          const pathParts = urlParts.slice(uploadIndex + 1);
          const startIndex = pathParts[0].match(/^v\\d+$/) ? 1 : 0;
          const publicIdWithExt = pathParts.slice(startIndex).join("/");
          const publicId = publicIdWithExt.substring(
            0,
            publicIdWithExt.lastIndexOf("."),
          );

          await deleteFromCloudinary(publicId);
        }
      } catch (cloudinaryError) {
        logger.error("Error deleting from Cloudinary:", cloudinaryError);
        // Continue anyway to remove from database
      }
    }

    // Remove from array
    contact.warrantyFiles.splice(fileIndex, 1);
    await contact.save();

    logger.info(
      `Warranty file deleted from contact ${id} at index ${fileIndex}`,
    );

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
      data: contact,
    });
  } catch (error) {
    logger.error("Error deleting warranty file:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting file",
      error: error.message,
    });
  }
};

// @desc    Get contact statistics
// @route   GET /api/v1/contacts/stats
// @access  Private/Admin
export const getContactStats = async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments({ isDeleted: false });

    const recentContacts = await Contact.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name title phoneNumber createdAt");

    res.status(200).json({
      success: true,
      data: {
        totalContacts,
        recentContacts,
      },
    });
  } catch (error) {
    logger.error("Error fetching contact stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching contact statistics",
      error: error.message,
    });
  }
};
