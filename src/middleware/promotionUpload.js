import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage for promotional material images
const promotionsUploadDir = path.join(__dirname, "../../public/uploads/promotions");

// Ensure upload directory exists
if (!existsSync(promotionsUploadDir)) {
  mkdirSync(promotionsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Double-check directory exists at runtime too
    if (!existsSync(promotionsUploadDir)) {
      mkdirSync(promotionsUploadDir, { recursive: true });
    }
    cb(null, promotionsUploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "promo-" + uniqueSuffix + ext);
  },
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Configure multer
const promotionUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export default promotionUpload;



