import express from "express";
import { ensureThumbnailExists } from "./utils/pdfThumbnail.js";

const router = express.Router();

// Route to generate thumbnail on-demand
router.get("/thumbnail/:designPath(*)", async (req, res) => {
  try {
    const designPath = `/uploads/product-labels/designs/${req.params.designPath}`;
    const thumbnailPath = await ensureThumbnailExists(designPath);
    
    if (thumbnailPath) {
      return res.redirect(thumbnailPath);
    }
    
    return res.status(404).json({ error: "Thumbnail not found" });
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return res.status(500).json({ error: "Failed to generate thumbnail" });
  }
});

export default router;

