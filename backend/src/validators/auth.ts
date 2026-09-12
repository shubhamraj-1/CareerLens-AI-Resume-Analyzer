import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum([
    "fresher",
    "developer",
    "software_engineer",
    "ai_engineer",
    "ai_ml_engineer",
    "other",
  ]),
  customRole: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Google sign-in: only a verified token. */
export const googleAuthBodySchema = z.object({
  credential: z.string().min(1),
}).strict();