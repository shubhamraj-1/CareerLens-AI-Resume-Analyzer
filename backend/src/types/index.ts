import type { Request } from "express";

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  role: string;
  customRole?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AnalyzeBody {
  resumeId: string;
}

export interface JobMatchBody {
  resumeId: string;
  jobDescription: string;
}
