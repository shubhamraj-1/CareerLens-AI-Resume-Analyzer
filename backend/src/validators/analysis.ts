import { z } from "zod";

// MongoDB ObjectId is a 24-character hex string
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID format");

export const analyzeSchema = z.object({
  resumeId: objectId,
});

export const jobMatchSchema = z.object({
  resumeId: objectId,
  jobDescription: z.string().min(10, "Job description must be at least 10 characters"),
});
