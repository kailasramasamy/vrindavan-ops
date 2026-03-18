import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists
const ensureUploadDir = () => {
  const uploadsDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "ad-assets"
  );
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

// Configure storage for ad assets
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const uploadsDir = ensureUploadDir();
      cb(null, uploadsDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "ad-asset-" + uniqueSuffix + ext);
  },
});

// File filter to allow images and videos
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/quicktime", // MOV
    "video/x-msvideo", // AVI
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only image (JPEG, PNG, WebP, GIF) and video (MP4, MOV, AVI) files are allowed!"
      ),
      false
    );
  }
};

// Configure multer with size limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    // For images, we'll check size in the controller (5MB)
  },
});

// Middleware to check image size (5MB limit for images)
export const checkImageSize = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }
  
  for (const file of req.files) {
    if (file.mimetype.startsWith("image/") && file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: `Image file ${file.originalname} exceeds 5MB limit`,
      });
    }
  }
  next();
};

// Error handling middleware for multer errors
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is 100MB for videos and 5MB for images.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: `Too many files. Maximum is 10 files per upload.`,
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'File upload failed',
    });
  }
  
  next();
};

export default upload;

