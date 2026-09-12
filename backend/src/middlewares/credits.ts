import type { Response, NextFunction } from "express";
import prisma from "../config/database";
import { sendError } from "../helpers/response";
import { env } from "../config/env";
import type { AuthenticatedRequest } from "../types";

/** Check if the given email is the admin (God Mode) */
function isAdmin(email: string | undefined): boolean {
  return !!email && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
}

/**
 * Middleware: checks the user has at least 1 AI credit remaining.
 * Admin (ADMIN_EMAIL) bypasses all credit checks.
 */
export async function requireCredits(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, "Authentication required", 401);
      return;
    }

    // ── Admin Bypass: skip credit check entirely ──
    if (isAdmin(req.user.email)) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { aiCredits: true, isPro: true },
    });

    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }

    if (user.aiCredits <= 0) {
      sendError(
        res,
        user.isPro
          ? "You've used all 100 AI credits for this month. Credits reset on your next billing cycle."
          : "You've used your free AI credit. Upgrade to Pro for 100 credits/month.",
        403
      );
      return;
    }

    (req as AuthenticatedRequest & { userCredits: number }).userCredits = user.aiCredits;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Deducts 1 AI credit from a user.
 * Admin (ADMIN_EMAIL) is never deducted — returns Infinity.
 */
export async function deductCredit(userId: string): Promise<number> {
  // Look up user email to check admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (user && isAdmin(user.email)) {
    return 999; // Admin: infinite credits, no deduction
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { aiCredits: { decrement: 1 } },
    select: { aiCredits: true },
  });
  return updated.aiCredits;
}
