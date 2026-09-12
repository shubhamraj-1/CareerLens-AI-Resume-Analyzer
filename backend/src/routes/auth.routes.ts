import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

// POST /api/auth/register
router.post("/register", (req, res, next) =>
  authController.register(req, res, next)
);

// POST /api/auth/login
router.post("/login", (req, res, next) =>
  authController.login(req, res, next)
);

// POST /api/auth/google
router.post("/google", (req, res, next) =>
  authController.googleAuth(req, res, next)
);

// GET /api/auth/profile
router.get("/profile", authenticate, (req, res, next) =>
  authController.getProfile(req, res, next)
);

export default router;
