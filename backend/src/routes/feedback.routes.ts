import { Router, type Response, type NextFunction } from "express";
import { authenticate } from "../middlewares/auth";
import { sendSuccess, sendError } from "../helpers/response";
import prisma from "../config/database";
import type { AuthenticatedRequest } from "../types";

const router = Router();

// POST /api/feedback
router.post("/", authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { sendError(res, "Unauthorized", 401); return; }

    const { rating, comment } = req.body;
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      sendError(res, "Rating must be a number between 1 and 5", 400);
      return;
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user.userId,
        rating,
        comment: typeof comment === "string" ? comment.trim().slice(0, 1000) : "",
      },
    });

    sendSuccess(res, { id: feedback.id, message: "Thank you for your feedback!" }, 201);
  } catch (error) {
    next(error);
  }
});

export default router;
