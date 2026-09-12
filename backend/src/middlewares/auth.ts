import type { Response, NextFunction } from "express";
import { verifyToken } from "../helpers/jwt";
import { sendError } from "../helpers/response";
import type { AuthenticatedRequest } from "../types";

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      sendError(res, "Authentication required", 401);
      return;
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    sendError(res, "Invalid or expired token", 401);
  }
}
