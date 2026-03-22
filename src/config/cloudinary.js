import cloudinary from "cloudinary";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

// Use v1 API
const cloudinaryV1 = cloudinary.v2;

const isNonEmpty = (v) => {
  const s = String(v ?? "").trim();
  return Boolean(s) && s.toLowerCase() !== "disabled";
};

export const isCloudinaryEnabled = () =>
  isNonEmpty(process.env.CLOUDINARY_CLOUD_NAME) &&
  isNonEmpty(process.env.CLOUDINARY_API_KEY) &&
  isNonEmpty(process.env.CLOUDINARY_API_SECRET);

const isLocalUploadsEnabled = () => {
  const flag = String(process.env.ENABLE_LOCAL_UPLOADS ?? "").toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  // Default to local uploads in dev if Cloudinary isn't configured.
  return (
    (process.env.NODE_ENV || "development") === "development" &&
    !isCloudinaryEnabled()
  );
};

const getUploadsDir = () => {
  // server/src/config/cloudinary.js -> server root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serverRoot = path.resolve(__dirname, "..", "..");
  return path.resolve(serverRoot, "uploads");
};

/**
 * Configure Cloudinary
 */
cloudinaryV1.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Test Cloudinary connection
 */
const testConnection = async () => {
  try {
    if (isCloudinaryEnabled()) {
      await cloudinaryV1.api.ping();
      logger.info("✅ Cloudinary connected successfully");
    } else {
      if (isLocalUploadsEnabled()) {
        logger.warn(
          "⚠️  Cloudinary not configured. Using local uploads storage (server/uploads).",
        );
      } else {
        logger.warn(
          "⚠️  Cloudinary credentials not configured. File uploads are disabled.",
        );
      }
    }
  } catch (error) {
    logger.error("❌ Cloudinary connection failed:", error.message);
  }
};

testConnection();

/**
 * Custom storage implementation for Cloudinary
 */
class CloudinaryStorage {
  constructor(options) {
    this.options = options;
  }

  _handleFile(req, file, cb) {
    // Determine resource type based on file mimetype
    let resourceType = "auto";
    if (file.mimetype === "application/pdf") {
      resourceType = "image"; // PDFs work better with image resource type
    } else if (file.mimetype.startsWith("image/")) {
      resourceType = "image";
    }

    const uploadOptions = {
      folder: this.options.folder,
      resource_type: resourceType,
      type: "upload", // Ensures public delivery
    };

    if (this.options.transformation) {
      uploadOptions.transformation = this.options.transformation;
    }

    // Generate public_id
    if (typeof this.options.public_id === "function") {
      uploadOptions.public_id = this.options.public_id(req, file);
    }

    // Upload to Cloudinary
    const uploadStream = cloudinaryV1.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return cb(error);
        }
        cb(null, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          url: result.secure_url,
          public_id: result.public_id,
          size: result.bytes,
          format: result.format,
        });
      },
    );

    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    cloudinaryV1.uploader.destroy(file.public_id, (error, result) => {
      cb(error);
    });
  }
}

/**
 * Storage configurations for different upload types
 */

// Profile pictures storage
export const profileStorage = new CloudinaryStorage({
  folder: "kmj-billing/profiles",
  allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
  transformation: [{ width: 500, height: 500, crop: "fill", gravity: "face" }],
  public_id: (req, file) => {
    const memberId = req.user?.memberId || "unknown";
    const timestamp = Date.now();
    return `profile-${memberId}-${timestamp}`;
  },
});

// Document uploads storage
export const documentStorage = new CloudinaryStorage({
  folder: "kmj-billing/documents",
  allowed_formats: ["jpg", "jpeg", "png", "pdf"],
  public_id: (req, file) => {
    const memberId = (req.user?.memberId || "unknown").replace(/\//g, "-");
    const timestamp = Date.now();
    const originalName = file.originalname
      .split(".")[0]
      .replace(/[^a-zA-Z0-9]/g, "_");
    return `doc-${memberId}-${originalName}-${timestamp}`;
  },
});

// Receipt/Bill storage
export const receiptStorage = new CloudinaryStorage({
  folder: "kmj-billing/receipts",
  allowed_formats: ["pdf", "jpg", "png"],
  public_id: (req, file) => {
    const receiptNo = req.body?.receiptNo || Date.now();
    return `receipt-${receiptNo}`;
  },
});

// Notice attachments storage
export const noticeStorage = new CloudinaryStorage({
  folder: "kmj-billing/notices",
  allowed_formats: ["jpg", "jpeg", "png", "pdf"],
  public_id: (req, file) => {
    const timestamp = Date.now();
    const originalName = file.originalname.split(".")[0];
    return `notice-${originalName}-${timestamp}`;
  },
});

/**
 * Multer configurations
 */

// File filter for images only
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// File filter for documents
const documentFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and PDF files are allowed!"), false);
  }
};

// File size limit
const fileSizeLimit = parseInt(process.env.MAX_FILE_SIZE) || 5242880; // 5MB

/**
 * Multer upload instances
 */

export const uploadProfile = multer({
  storage: isCloudinaryEnabled()
    ? profileStorage
    : (() => {
        if (!isLocalUploadsEnabled()) throw new Error("Cloudinary is disabled");
        const dir = getUploadsDir();
        fs.mkdirSync(dir, { recursive: true });
        return multer.diskStorage({
          destination: (req, file, cb) => cb(null, dir),
          filename: (req, file, cb) => {
            const memberId = String(req.user?.memberId || "unknown").replace(
              /\//g,
              "-",
            );
            const ext = path.extname(file.originalname || "") || "";
            cb(null, `profile-${memberId}-${Date.now()}${ext}`);
          },
        });
      })(),
  fileFilter: imageFilter,
  limits: {
    fileSize: fileSizeLimit,
  },
});

export const uploadDocument = multer({
  storage: isCloudinaryEnabled()
    ? documentStorage
    : (() => {
        if (!isLocalUploadsEnabled()) throw new Error("Cloudinary is disabled");
        const dir = getUploadsDir();
        fs.mkdirSync(dir, { recursive: true });
        return multer.diskStorage({
          destination: (req, file, cb) => cb(null, dir),
          filename: (req, file, cb) => {
            const memberId = String(req.user?.memberId || "unknown").replace(
              /\//g,
              "-",
            );
            const ext = path.extname(file.originalname || "") || "";
            const base = path
              .basename(file.originalname || "file", ext)
              .replace(/[^a-zA-Z0-9]/g, "_");
            cb(null, `doc-${memberId}-${base}-${Date.now()}${ext}`);
          },
        });
      })(),
  fileFilter: documentFilter,
  limits: {
    fileSize: fileSizeLimit,
  },
});

export const uploadReceipt = multer({
  storage: isCloudinaryEnabled()
    ? receiptStorage
    : (() => {
        if (!isLocalUploadsEnabled()) throw new Error("Cloudinary is disabled");
        const dir = getUploadsDir();
        fs.mkdirSync(dir, { recursive: true });
        return multer.diskStorage({
          destination: (req, file, cb) => cb(null, dir),
          filename: (req, file, cb) => {
            const receiptNo = String(req.body?.receiptNo || Date.now()).replace(
              /[^a-zA-Z0-9_-]/g,
              "_",
            );
            const ext = path.extname(file.originalname || "") || "";
            cb(null, `receipt-${receiptNo}-${Date.now()}${ext}`);
          },
        });
      })(),
  limits: {
    fileSize: fileSizeLimit,
  },
});

export const uploadNotice = multer({
  storage: isCloudinaryEnabled()
    ? noticeStorage
    : (() => {
        if (!isLocalUploadsEnabled()) throw new Error("Cloudinary is disabled");
        const dir = getUploadsDir();
        fs.mkdirSync(dir, { recursive: true });
        return multer.diskStorage({
          destination: (req, file, cb) => cb(null, dir),
          filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "") || "";
            const base = path
              .basename(file.originalname || "file", ext)
              .replace(/[^a-zA-Z0-9]/g, "_");
            cb(null, `notice-${base}-${Date.now()}${ext}`);
          },
        });
      })(),
  fileFilter: documentFilter,
  limits: {
    fileSize: fileSizeLimit,
  },
});

/**
 * Utility functions for Cloudinary operations
 */

// Delete file from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    if (!isCloudinaryEnabled()) {
      if (!isLocalUploadsEnabled()) {
        return { result: "Cloudinary disabled" };
      }

      const dir = getUploadsDir();
      const safeName = path.basename(String(publicId || ""));
      const fullPath = path.resolve(dir, safeName);
      if (!fullPath.startsWith(dir)) return { result: "Invalid path" };
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      return { result: "ok" };
    }

    const result = await cloudinaryV1.uploader.destroy(publicId);
    return result;
  } catch (error) {
    logger.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};

// Delete multiple files
export const deleteMultipleFromCloudinary = async (publicIds) => {
  try {
    const result = await cloudinaryV1.api.delete_resources(publicIds);
    return result;
  } catch (error) {
    logger.error("Error deleting multiple from Cloudinary:", error);
    throw error;
  }
};

// Get resource details
export const getCloudinaryResource = async (publicId) => {
  try {
    const result = await cloudinaryV1.api.resource(publicId);
    return result;
  } catch (error) {
    logger.error("Error getting Cloudinary resource:", error);
    throw error;
  }
};

// Generate signed URL for private resources
export const generateSignedUrl = (publicId, options = {}) => {
  return cloudinaryV1.url(publicId, {
    sign_url: true,
    type: "private",
    ...options,
  });
};

export { cloudinaryV1 as cloudinary };
export default cloudinaryV1;
