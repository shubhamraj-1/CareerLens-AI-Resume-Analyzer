import { Router } from "express";
import authRoutes from "./auth.routes";
import resumeRoutes from "./resume.routes";
import analysisRoutes from "./analysis.routes";
import stripeRoutes from "./stripe.routes";
import feedbackRoutes from "./feedback.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/resume", resumeRoutes);
router.use("/analysis", analysisRoutes);
router.use("/stripe", stripeRoutes);
router.use("/feedback", feedbackRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
