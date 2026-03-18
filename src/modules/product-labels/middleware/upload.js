import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists
const uploadDir = "public/uploads/product-labels/designs";
const fullPath = path.join(process.cwd(), uploadDir);

if (!fs.existsSync(fullPath)) {
  fs.mkdirSync(fullPath, { recursive: true });
}

// Storage configuration for PDF design files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).substring(0, 50); // Limit filename length
    cb(null, baseName + "-" + uniqueSuffix + ext);
  },
});

// File filter - only allow PDF files
const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === "application/pdf";

  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error("Invalid file type. Only PDF files are allowed for design files."));
};

// Create multer instance for PDF uploads
export const labelDesignUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for PDF files
    files: 1, // Single file upload
  },
  fileFilter: fileFilter,
});

export default labelDesignUpload;


