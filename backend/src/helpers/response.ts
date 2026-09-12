import type { Response } from "express";

export function sendSuccess(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json(data);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown
) {
  return res.status(statusCode).json({ message, errors });
}
