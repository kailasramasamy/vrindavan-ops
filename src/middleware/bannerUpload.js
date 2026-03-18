import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define upload directories
const imageUploadDir = path.join(__dirname, "../../public/uploads/banners/images");
const documentUploadDir = path.join(__dirname, "../../public/uploads/banners/documents");

// Ensure upload directories exist
if (!existsSync(imageUploadDir)) {
  mkdirSync(imageUploadDir, { recursive: true });
  console.log('Created banner images upload directory:', imageUploadDir);
}
if (!existsSync(documentUploadDir)) {
  mkdirSync(documentUploadDir, { recursive: true });
  console.log('Created banner documents upload directory:', documentUploadDir);
}

// Configure storage for banner images and documents
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on file type
    const targetDir = file.mimetype.startsWith("image/") ? imageUploadDir : documentUploadDir;
    
    // Ensure directory exists before saving (double-check)
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      console.log('Created upload directory:', targetDir);
    }
    
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "banner-" + uniqueSuffix + ext);
  },
});

// File filter to allow images and documents
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image and document files are allowed!"), false);
  }
};

// Configure multer
const bannerUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

export default bannerUpload;






