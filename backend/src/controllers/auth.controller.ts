import type { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import { authService } from "../services/auth.service";
import { registerSchema, loginSchema, googleAuthBodySchema } from "../validators/auth";
import { sendSuccess, sendError } from "../helpers/response";
import { env } from "../config/env";
import type { AuthenticatedRequest } from "../types";

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = registerSchema.parse(req.body);
      const result = await authService.register(data);
      sendSuccess(res, result, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "Email already registered") {
        sendError(res, error.message, 409);
        return;
      }
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data);
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid email or password") {
        sendError(res, error.message, 401);
        return;
      }
      next(error);
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const user = await authService.getProfile(req.user.userId);
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  }
  async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = googleAuthBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        sendError(res, first?.message || "Invalid request body", 400);
        return;
      }

      const token = parsed.data.credential.trim();
      const isLikelyIdToken = token.split(".").length === 3;

      let email: string | undefined;
      let name: string | undefined;
      let picture: string | undefined;

      // If JWT: verifyIdToken. Otherwise (or on failure): Bearer access token → server-side userinfo only (no client profile).
      if (isLikelyIdToken && env.GOOGLE_CLIENT_ID) {
        try {
          const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
          const ticket = await client.verifyIdToken({
            idToken: token,
            audience: env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (payload?.email) {
            email = payload.email;
            name = payload.name;
            picture = payload.picture;
          }
        } catch {
          // Not a valid ID token for this client — may be a JWT-shaped access token; try userinfo below
        }
      }

      if (!email) {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!userInfoRes.ok) {
          sendError(res, "Could not verify Google account. Please try again.", 401);
          return;
        }
        const p = (await userInfoRes.json()) as { email?: string; name?: string; picture?: string };
        if (!p?.email) {
          sendError(res, "Could not verify Google account. Please try again.", 401);
          return;
        }
        email = p.email;
        name = p.name;
        picture = p.picture;
      }

      const result = await authService.googleAuth({
        email: email!,
        name: (name as string) || email!.split("@")[0],
        picture: picture || "",
      });

      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Token used too late")) {
        sendError(res, "Google token expired. Please try again.", 401);
        return;
      }
      next(error);
    }
  }
}

export const authController = new AuthController();
