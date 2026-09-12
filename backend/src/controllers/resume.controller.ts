import type { Response, NextFunction } from "express";
import { resumeService } from "../services/resume.service";
import { sendSuccess, sendError } from "../helpers/response";
import type { AuthenticatedRequest } from "../types";

export class ResumeController {
  async upload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      if (!req.file) {
        sendError(res, "No file uploaded", 400);
        return;
      }
      const resume = await resumeService.upload(req.user.userId, req.file);
      sendSuccess(res, resume, 201);
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const resumes = await resumeService.getHistory(req.user.userId);
      sendSuccess(res, resumes);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const id = req.params.id as string;
      const resume = await resumeService.getById(id, req.user.userId);
      sendSuccess(res, resume);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        sendError(res, "Unauthorized", 401);
        return;
      }
      const id = req.params.id as string;
      const result = await resumeService.delete(id, req.user.userId);
      sendSuccess(res, result);
    } catch (error) {
      if (error instanceof Error && error.message === "Resume not found") {
        sendError(res, error.message, 404);
        return;
      }
      next(error);
    }
  }
}

export const resumeController = new ResumeController();
