import { Router } from "express";
import { resumeController } from "../controllers/resume.controller";
import { authenticate } from "../middlewares/auth";
import { upload } from "../config/multer";

const router = Router();

// POST /api/resume/upload
router.post("/upload", authenticate, upload.single("resume"), (req, res, next) =>
  resumeController.upload(req, res, next)
);

// GET /api/resume/history
router.get("/history", authenticate, (req, res, next) =>
  resumeController.getHistory(req, res, next)
);

// GET /api/resume/:id
router.get("/:id", authenticate, (req, res, next) =>
  resumeController.getById(req, res, next)
);

// DELETE /api/resume/:id
router.delete("/:id", authenticate, (req, res, next) =>
  resumeController.delete(req, res, next)
);

export default router;
