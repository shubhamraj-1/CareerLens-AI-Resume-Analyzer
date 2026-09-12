import prisma from "../config/database";
import fs from "fs";
import path from "path";
import { extractTextFromBuffer } from "./analysis.service";

type SupportedExt = ".pdf" | ".docx";

function detectExt(file: Express.Multer.File): SupportedExt | null {
  const e = path.extname(file.originalname).toLowerCase();
  if (e === ".pdf" || e === ".docx") return e;
  if (file.mimetype === "application/pdf") return ".pdf";
  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return ".docx";
  }
  return null;
}

export class ResumeService {
  async upload(userId: string, file: Express.Multer.File) {
    const resume = await prisma.resume.create({
      data: {
        userId,
        fileUrl: file.path,
        fileName: file.originalname,
      },
      include: {
        analysis: true,
      },
    });

    // ── Persist extracted text now, while the bytes are still in this serverless invocation.
    // On Vercel, `/tmp` is *not* shared between invocations — so a later /analyze call
    // would not see the file at all. Caching the text here makes /analyze deterministic.
    try {
      const ext = detectExt(file);
      if (!ext) {
        console.warn("[Resume upload] Unsupported extension/mime:", file.originalname, file.mimetype);
      } else {
        let buffer: Buffer | null = null;
        if (file.buffer && file.buffer.length > 0) {
          buffer = file.buffer;
        } else if (file.path && fs.existsSync(file.path)) {
          buffer = fs.readFileSync(file.path);
        }

        if (!buffer) {
          console.error("[Resume upload] No buffer or readable file path — cannot pre-extract text");
        } else {
          const extracted = await extractTextFromBuffer(buffer, ext, file.originalname, file.path);
          if (extracted.trim()) {
            await prisma.resume.update({
              where: { id: resume.id },
              data: { storedResumeText: extracted.slice(0, 500_000) },
            });
            const refreshed = await prisma.resume.findFirst({
              where: { id: resume.id, userId },
              include: { analysis: true },
            });
            if (refreshed) return refreshed;
          } else {
            console.warn(
              `[Resume upload] Extraction yielded 0 words for ${file.originalname} — analyze will likely fail until user uploads a text-based PDF/DOCX.`,
            );
          }
        }
      }
    } catch (err) {
      console.error("[Resume upload] Pre-extraction failed (non-fatal):", err);
    }

    return resume;
  }

  async getHistory(userId: string) {
    const resumes = await prisma.resume.findMany({
      where: { userId },
      include: { analysis: true },
      orderBy: { createdAt: "desc" },
    });

    return resumes;
  }

  async getById(id: string, userId: string) {
    const resume = await prisma.resume.findFirst({
      where: { id, userId },
      include: { analysis: true },
    });

    if (!resume) {
      throw new Error("Resume not found");
    }

    return resume;
  }

  async delete(id: string, userId: string) {
    const resume = await prisma.resume.findFirst({
      where: { id, userId },
    });

    if (!resume) {
      throw new Error("Resume not found");
    }

    try {
      const filePath = path.resolve(resume.fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* file may already be gone (e.g. /tmp wiped) */
    }

    await prisma.resume.delete({
      where: { id },
    });

    return { message: "Resume deleted successfully" };
  }
}

export const resumeService = new ResumeService();
