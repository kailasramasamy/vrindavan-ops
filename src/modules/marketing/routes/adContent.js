import express from "express";
import { requireAuth } from "../../../middleware/rbac.js";
import upload, { checkImageSize, handleMulterError } from "../../../middleware/adAssetUpload.js";
import {
  adController,
  assetController,
  adAssetMappingController,
  adTextController,
  publishingController,
  platformController,
} from "../controllers/adContentController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Platform routes
router.get("/platforms", platformController.getAll);

// Asset routes
router.post(
  "/assets/upload",
  (req, res, next) => {
    upload.array("files", 10)(req, res, (err) => {
      if (err) {
        return handleMulterError(err, req, res, next);
      }
      next();
    });
  },
  checkImageSize,
  async (req, res, next) => {
    try {
      await assetController.upload(req, res);
    } catch (error) {
      console.error("Unhandled error in asset upload:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload assets",
      });
    }
  }
);
router.get("/assets", assetController.getAll);
router.get("/assets/:id", assetController.getById);
router.delete("/assets/:id", assetController.delete);

// Ad routes
router.get("/ads", adController.getAll);
router.get("/ads/statistics", adController.getStatistics);
router.get("/ads/:id", adController.getById);
router.post("/ads", adController.create);
router.put("/ads/:id", adController.update);
router.delete("/ads/:id", adController.delete);
router.post("/ads/:id/submit-review", adController.submitForReview);
router.post("/ads/:id/approve", adController.approve);
router.post("/ads/:id/reject", adController.reject);
router.post("/ads/:id/archive", adController.archive);

// Ad-Asset mapping routes
router.post("/ads/:ad_id/assets", adAssetMappingController.addAssets);
router.delete(
  "/ads/:ad_id/assets/:asset_id",
  adAssetMappingController.removeAsset
);

// Ad text routes
router.post("/ads/:ad_id/texts", adTextController.saveTexts);
router.get("/ads/:ad_id/texts", adTextController.getTexts);
router.put("/ads/:ad_id/texts/:id", adTextController.updateText);
router.delete("/texts/:id", adTextController.deleteText);

// Publishing routes
router.post("/publishings", publishingController.create);
router.get("/publishings", publishingController.getAll);
router.get("/publishings/:id", publishingController.getById);
router.put("/publishings/:id", publishingController.update);
router.delete("/publishings/:id", publishingController.delete);

export default router;

