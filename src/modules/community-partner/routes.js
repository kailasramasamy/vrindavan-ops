import { Router } from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import commissionRoutes from "./routes/commissions.js";
import cpRoutes from "./routes/cp.js";
import mappingRoutes from "./routes/mappings.js";
import marginRoutes from "./routes/margins.js";
import orderRoutes from "./routes/orders.js";
import payoutRoutes from "./routes/payouts.js";
import promoRoutes from "./routes/promotions.js";
import bannerRoutes from "./routes/banners.js";
import targetRoutes from "./routes/targets.js";
import notificationRoutes from "./routes/notifications.js";
import ticketRoutes from "./routes/tickets.js";
import inviteMessageRoutes from "./routes/inviteMessage.js";

const router = Router();

// API routes - router is mounted at /cp, so these become /cp/api/*
router.use("/api/auth", authRoutes);
router.use("/api/cp", cpRoutes);
router.use("/api/margins", marginRoutes);
router.use("/api/mappings", mappingRoutes);
router.use("/api/orders", orderRoutes);
router.use("/api/commissions", commissionRoutes);
router.use("/api/payouts", payoutRoutes);
router.use("/api/promotions", promoRoutes);
router.use("/api/banners", bannerRoutes);
router.use("/api/targets", targetRoutes);
router.use("/api/notifications", notificationRoutes);
router.use("/api/tickets", ticketRoutes);
router.use("/api/invite-message", inviteMessageRoutes);

// Error handling middleware
router.use(errorHandler);

export default router;
