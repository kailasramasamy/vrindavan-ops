import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const uploadDirs = ["public/uploads/po/products", "public/uploads/po/vendors", "public/uploads/po/invoices", "public/uploads/po/delivery"];

uploadDirs.forEach((dir) => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPaths = {
      product: "public/uploads/po/products/",
      vendor: "public/uploads/po/vendors/",
      invoice: "public/uploads/po/invoices/",
      delivery: "public/uploads/po/delivery/",
    };
    const uploadPath = uploadPaths[req.params.type] || "public/uploads/po/";
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).substring(0, 50); // Limit filename length
    cb(null, baseName + "-" + uniqueSuffix + ext);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xlsx|xls/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.match(/^(image\/(jpeg|jpg|png)|application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel))$/);

  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error("Invalid file type. Only images (JPG, PNG) and documents (PDF, DOC, DOCX, XLS, XLSX) allowed."));
};

// Create multer instance
export const poUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Single file upload
  },
  fileFilter: fileFilter,
});

// Multi-file upload for multiple images
export const poUploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5, // Max 5 files
  },
  fileFilter: fileFilter,
});

// Specific upload for invoices (always goes to invoices folder)
export const invoiceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "public/uploads/po/invoices/");
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext).substring(0, 50); // Limit filename length
      cb(null, baseName + "-" + uniqueSuffix + ext);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Single file upload
  },
  fileFilter: fileFilter,
});

export default poUpload;
