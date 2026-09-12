import prisma from "../config/database";
import fs from "fs";
import path from "path";
import { runNlpAnalysis, classifyIndustry, extractKeywordsTfIdf, detectDynamicSkills } from "./nlp.engine";
import {
  isLlmAvailable,
  llmAnalyzeResume,
  llmJobMatch,
  llmInterviewQuestions,
  llmInterviewPredictor,
  llmSmartFeedback,
  llmChat,
  llmGenerateContent,
  llmEvaluateAnswer,
  llmSuggestProjects,
  llmCareerGrowth,
  extractTextWithGeminiVision,
} from "./llm.service";
import type { ChatHistoryTurn } from "./llm.service";
import { ClientError } from "../utils/http-errors";
import { RateLimitError } from "../middlewares/errorHandler";

/** Minimum word count to run scoring / LLM — below this we reject (no hallucinated scores). */
const MIN_WORDS_FOR_SCORING = 50;
/** If pdf-parse yields fewer words than this, try Gemini Vision (may recover scanned PDFs). */
const MIN_WORDS_TRY_GEMINI_AFTER_PDF = 25;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Legacy failed runs stored this sentence as `storedResumeText` — never score or preview it as real content. */
function looksLikeExtractionPlaceholder(text: string): boolean {
  return /could not be parsed for text content/i.test(text);
}

/**
 * Detect failed / glitched analysis suitable for discarding in favor of
 * fallbacks, or for suppressing misleading compare deltas. Kept in sync with
 * analyzeResume() safety-net logic.
 */
function isDegenerateAnalysis(
  ats: number,
  skills: number,
  exp: number,
  edu: number,
  proj: number,
): boolean {
  const sectionSum = skills + exp + edu + proj;
  if (sectionSum <= 5) return true;
  if (ats < 5 && sectionSum < 30) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════
// ── Robust Text Extraction & Normalization ───────────────────────
// ══════════════════════════════════════════════════════════════════

/**
 * Normalize text extracted from PDF/DOCX:
 * - Fix multi-column jumble by re-ordering lines
 * - Remove excess whitespace, tabs, form-feeds
 * - Merge broken lines (hyphenated words, mid-sentence breaks)
 * - Normalize bullet point characters
 * - Clean control characters and encoding artifacts
 */
function normalizeResumeText(raw: string): string {
  let text = raw;

  // 1. Remove control characters (keep newlines, tabs, spaces)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Normalize unicode dashes, quotes, bullets
  text = text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')    // smart double quotes
    .replace(/[\u2013\u2014]/g, " — ")              // em/en dashes
    .replace(/[\u2022\u2023\u25AA\u25AB\u25B8\u25B9\u25BA\u25CB\u25CF\u25D8\u25E6\u2043\u2219\u27A2\u27A4]/g, "• ")  // bullet chars
    .replace(/[\uFEFF\u200B\u200C\u200D]/g, "");    // zero-width chars

  // 3. Normalize tabs and multiple spaces
  text = text.replace(/\t+/g, "  ");
  text = text.replace(/ {3,}/g, "  ");               // 3+ spaces → 2

  // 4. Fix multi-column detection: if a line has large internal gaps (4+ spaces), split it
  const lines = text.split("\n");
  const processedLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { processedLines.push(""); continue; }

    // Detect multi-column lines: large gap in the middle
    const columnSplit = trimmed.split(/\s{4,}/);
    if (columnSplit.length >= 2 && columnSplit[0].length > 10 && columnSplit[1].length > 10) {
      // This looks like two columns side by side — add as separate lines
      for (const col of columnSplit) {
        const cleaned = col.trim();
        if (cleaned.length > 3) processedLines.push(cleaned);
      }
    } else {
      processedLines.push(trimmed);
    }
  }

  text = processedLines.join("\n");

  // 5. Merge broken lines (lines that end without punctuation and next line starts lowercase)
  const finalLines: string[] = [];
  for (let i = 0; i < processedLines.length; i++) {
    const current = processedLines[i].trim();
    const next = processedLines[i + 1]?.trim();

    if (
      current &&
      next &&
      !current.match(/[.!?:;,|]$/) &&                 // current doesn't end with punctuation
      !current.match(/^\s*(•|[-–—*]|\d+[.)]\s)/) &&   // current isn't a bullet
      next.match(/^[a-z]/) &&                           // next starts with lowercase
      !next.match(/^\s*(•|[-–—*]|\d+[.)]\s)/) &&      // next isn't a bullet
      current.length < 80                               // current isn't already long
    ) {
      processedLines[i + 1] = current + " " + next;    // merge into next
    } else {
      finalLines.push(current);
    }
  }

  text = finalLines.join("\n");

  // 6. Normalize bullet points to consistent format
  text = text.replace(/^[\s]*(•|[-–—*▪▸►●○◦·]|[➤➢➣▶])\s*/gm, "• ");

  // 7. Remove duplicate blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  // 8. Remove page numbers and headers/footers patterns
  text = text.replace(/^\s*page\s*\d+\s*(of\s*\d+)?\s*$/gmi, "");
  text = text.replace(/^\s*\d+\s*$/gm, ""); // standalone numbers (page numbers)

  // 9. Remove orphaned punctuation lines (lines with only ".", ",", ";", ":", etc.)
  text = text.replace(/^\s*[.,;:!?)\]}\-–—]+\s*$/gm, "");

  // 10. Merge short orphaned lines into previous line (lines < 4 chars that aren't bullets or section headers)
  const cleanedLines = text.split("\n");
  const merged: string[] = [];
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i].trim();
    if (
      line.length > 0 &&
      line.length < 4 &&
      !/^[•\-*]/.test(line) &&
      !/^[A-Z]{2,}/.test(line) &&
      merged.length > 0
    ) {
      // Append orphaned fragment to previous line
      merged[merged.length - 1] = merged[merged.length - 1] + " " + line;
    } else {
      merged.push(line);
    }
  }
  text = merged.join("\n");

  // 11. Clean excessive spaces within lines
  text = text.replace(/ {2,}/g, " ");

  // 12. Remove duplicate blank lines (again, after merges)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 13. Final trim
  text = text.trim();

  return text;
}

type FileExt = ".pdf" | ".docx";

/**
 * Buffer-based extraction (no disk dependency). Use this from the upload pipeline
 * where we already hold the bytes — avoids `/tmp` gotchas on Vercel completely.
 *
 * `pdfFallbackPath` is only consulted for the *Gemini Vision* fallback (the SDK reads
 * a file path). When undefined and a Vision retry is needed, we write a temp file ourselves.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  ext: FileExt,
  fileLabel: string,
  pdfFallbackPath?: string,
): Promise<string> {
  let rawText = "";
  try {
    if (ext === ".pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      rawText = data.text || "";
      const w = countWords(rawText);
      console.log(
        `[Parser] PDF ${fileLabel}: ${buffer.length} bytes → pdf-parse word count: ${w}` +
          (w === 0
            ? " (empty — may be image-only or protected)"
            : ` — preview: ${(rawText || "").slice(0, 120).replace(/\s+/g, " ")}…`),
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || "";
      console.log(`[Parser] DOCX ${fileLabel}: ${buffer.length} bytes → mammoth word count: ${countWords(rawText)}`);
    }
  } catch (error) {
    console.error(`[Parser] ${ext} parse error for ${fileLabel}:`, error instanceof Error ? error.message : error);
    rawText = "";
  }

  // PDF + weak/empty result + we have an LLM key → try Gemini Vision (multimodal PDF read).
  const needsVision =
    ext === ".pdf" &&
    isLlmAvailable() &&
    (!rawText.trim() || countWords(rawText) < MIN_WORDS_TRY_GEMINI_AFTER_PDF);

  if (needsVision) {
    let visionPath = pdfFallbackPath;
    let tempCreated = false;
    try {
      if (!visionPath || !fs.existsSync(visionPath)) {
        const tmpDir = process.env.VERCEL ? "/tmp/uploads" : path.resolve("./uploads");
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        visionPath = path.join(
          tmpDir,
          `vision-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`,
        );
        fs.writeFileSync(visionPath, buffer);
        tempCreated = true;
      }
      console.log(
        `[Parser] pdf-parse yielded ${countWords(rawText)} words — trying Gemini Vision OCR for: ${fileLabel}`,
      );
      const geminiText = await extractTextWithGeminiVision(visionPath);
      if (geminiText.trim() && (!rawText.trim() || countWords(geminiText) > countWords(rawText))) {
        rawText = geminiText;
      }
    } catch (err) {
      console.error(`[Parser] Gemini Vision fallback errored for ${fileLabel}:`, err instanceof Error ? err.message : err);
    } finally {
      if (tempCreated && visionPath) {
        try {
          fs.unlinkSync(visionPath);
        } catch {
          /* best-effort cleanup */
        }
      }
    }
  }

  if (!rawText.trim()) {
    console.warn(`[Parser] No extractable text after pdf-parse + optional Gemini Vision for ${fileLabel}`);
    return "";
  }

  const normalized = normalizeResumeText(rawText);
  console.log(`[Parser] Extracted ${countWords(normalized)} words from ${fileLabel} (length ${normalized.length})`);
  return normalized;
}

/**
 * Extract text from PDF or DOCX with robust normalization.
 * Reads from disk if the file is still there (local dev / same Vercel invocation).
 * Returns `""` if the file is missing — callers fall back to `storedResumeText`.
 */
export async function extractTextFromFile(filePath: string): Promise<string> {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`File not found: ${resolvedPath}`);
    return "";
  }
  if (ext !== ".pdf" && ext !== ".docx") {
    console.warn(`Unsupported file extension: ${ext} (${resolvedPath})`);
    return "";
  }

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(resolvedPath);
  } catch (err) {
    console.error(`[Parser] Could not read file at ${resolvedPath}:`, err instanceof Error ? err.message : err);
    return "";
  }

  return extractTextFromBuffer(buffer, ext, path.basename(resolvedPath), resolvedPath);
}

// ══════════════════════════════════════════════════════════════════
// ── Structured Section Extractor ─────────────────────────────────
// ══════════════════════════════════════════════════════════════════

interface ExtractedSections {
  summary: string;
  experience: string;
  skills: string;
  education: string;
  projects: string;
  certifications: string;
  other: string;
  fullText: string;
}

/**
 * Split resume text into structured sections using comprehensive patterns
 */
function extractSections(text: string): ExtractedSections {
  // Comprehensive section header patterns (with synonyms)
  const SECTION_HEADERS = [
    { key: "summary",        pattern: /^(?:professional\s+)?(?:summary|objective|about\s+me|profile|career\s+(?:summary|objective|profile)|executive\s+summary|introduction|personal\s+statement)$/i },
    { key: "experience",     pattern: /^(?:(?:work|professional|employment|career|job)\s+)?(?:experience|history)|(?:experience|employment|work)\s*(?:history|background)?$/i },
    { key: "skills",         pattern: /^(?:(?:technical|core|key|professional|relevant)\s+)?(?:skills|competencies|proficiencies|technologies|expertise|tech\s+stack|tools\s*(?:&|and)?\s*technologies|areas?\s+of\s+expertise|technical\s+proficiency)$/i },
    { key: "education",      pattern: /^(?:education|academic\s+(?:background|qualifications|history)|qualifications|educational\s+(?:background|qualifications)|degrees?|academics?|academic\s+details?)$/i },
    { key: "projects",       pattern: /^(?:(?:personal|academic|key|relevant|research|notable|side)\s+)?(?:projects|portfolio|contributions|open\s+source)$/i },
    { key: "certifications", pattern: /^(?:certifications?|licenses?(?:\s*(?:&|and)\s*certifications?)?|professional\s+(?:certifications?|development)|courses?|training)$/i },
  ];

  const lines = text.split("\n");
  const sections: { key: string; startLine: number }[] = [];

  // Find section boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
      .replace(/^[\s•\-–—*:]+/, "")          // strip leading bullets
      .replace(/[:]+\s*$/, "")                 // strip trailing colons
      .trim();

    if (line.length < 3 || line.length > 60) continue; // skip too short or too long

    for (const header of SECTION_HEADERS) {
      if (header.pattern.test(line)) {
        sections.push({ key: header.key, startLine: i });
        break;
      }
    }
  }

  // Extract text between section boundaries
  const result: ExtractedSections = {
    summary: "", experience: "", skills: "",
    education: "", projects: "", certifications: "",
    other: "", fullText: text,
  };

  if (sections.length === 0) {
    // No sections detected — put everything in "other"
    result.other = text;
    return result;
  }

  // Text before first section → summary (if no explicit summary section)
  if (sections[0].startLine > 2) {
    const beforeFirst = lines.slice(0, sections[0].startLine).join("\n").trim();
    if (!sections.some((s) => s.key === "summary") && beforeFirst.length > 20) {
      result.summary = beforeFirst;
    }
  }

  // Extract each section's content
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startLine + 1; // skip header line
    const end = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    const content = lines.slice(start, end).join("\n").trim();

    const key = sections[i].key as keyof ExtractedSections;
    if (key in result && key !== "fullText") {
      result[key] = (result[key] ? result[key] + "\n" : "") + content;
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════
// ── AI Analysis Engine ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

class AnalysisEngine {
  // ─── Keyword Dictionaries ───
  static readonly TECH_KEYWORDS = [
    "javascript", "typescript", "python", "java", "c++", "c#", "golang", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
    "react", "angular", "vue", "svelte", "next.js", "nuxt", "gatsby", "remix",
    "node.js", "express", "fastapi", "django", "flask", "spring boot", "rails", "laravel",
    "sql", "postgresql", "mysql", "mongodb", "redis", "firebase", "dynamodb", "cassandra",
    "elasticsearch", "sqlite", "oracle", "neo4j",
    "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ansible", "vagrant",
    "git", "github", "gitlab", "bitbucket", "ci/cd", "jenkins", "github actions",
    "rest api", "graphql", "microservices", "serverless", "grpc", "websocket",
    "html", "css", "sass", "scss", "tailwind", "bootstrap", "material ui", "chakra ui",
    "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "keras",
    "nlp", "computer vision", "data science", "data analysis", "pandas", "numpy", "scipy",
    "opencv", "transformers", "hugging face", "langchain",
    "agile", "scrum", "jira", "figma", "linux", "bash", "powershell",
    "webpack", "vite", "babel", "eslint", "prettier",
    "jest", "mocha", "cypress", "playwright", "selenium",
    "nginx", "apache", "kafka", "rabbitmq", "celery",
    "redux", "zustand", "mobx", "recoil",
    "prisma", "sequelize", "typeorm", "mongoose",
    "jwt", "oauth", "auth0", "passport",
    "vercel", "netlify", "heroku", "digitalocean", "cloudflare",
    "tableau", "power bi", "grafana", "prometheus",
    "airflow", "spark", "hadoop", "databricks", "snowflake",
  ];

  static readonly SOFT_SKILLS = [
    "leadership", "communication", "teamwork", "problem solving", "problem-solving",
    "critical thinking", "time management", "adaptability", "creativity",
    "collaboration", "mentoring", "project management", "analytical",
    "detail-oriented", "self-motivated", "strategic", "innovative",
    "negotiation", "presentation", "stakeholder management", "decision making",
    "conflict resolution", "coaching", "cross-functional", "multitasking",
    "interpersonal", "empathy", "emotional intelligence", "active listening",
    "written communication", "verbal communication", "public speaking", "facilitation",
    "delegation", "accountability", "reliability", "dependability", "initiative",
    "work ethic", "organizational skills", "prioritization", "customer service",
    "client-facing", "relationship building", "influence", "persuasion",
    "agile mindset", "growth mindset", "resilience", "cultural awareness",
    "diversity and inclusion", "inclusivity", "team player", "people management",
  ];

  /** Common resume phrases → canonical soft-skill labels (deduped with dictionary matches). */
  private static readonly SOFT_SKILL_PHRASES: { pattern: RegExp; label: string }[] = [
    { pattern: /\bteam\s+player\b/i, label: "Teamwork" },
    { pattern: /\bpeople\s+manager\b/i, label: "People management" },
    { pattern: /\bstrong\s+(written|verbal)\s+communication\b/i, label: "Communication" },
    { pattern: /\bexcellent\s+communicator\b/i, label: "Communication" },
    { pattern: /\binterpersonal\s+skills?\b/i, label: "Interpersonal" },
    { pattern: /\bwork\s+closely\s+with\b/i, label: "Collaboration" },
    { pattern: /\bcross[-\s]?functional\b/i, label: "Cross-functional" },
    { pattern: /\bstakeholder(s)?\b/i, label: "Stakeholder management" },
    { pattern: /\bled\s+(a\s+)?team\b/i, label: "Leadership" },
    { pattern: /\bmentor(ed|ing)?\b/i, label: "Mentoring" },
    { pattern: /\bclient[-\s]?facing\b/i, label: "Client-facing" },
    { pattern: /\bproblem[-\s]?solver\b/i, label: "Problem solving" },
    { pattern: /\bself[-\s]?starter\b/i, label: "Initiative" },
    { pattern: /\bfast[-\s]?paced\b.*\b(environment|team)\b/i, label: "Adaptability" },
  ];

  /** Collect soft-skill labels from dictionary + phrase heuristics (stable order). */
  static findSoftSkillsInText(raw: string): string[] {
    const lower = raw.toLowerCase();
    const found = new Set<string>();
    for (const kw of AnalysisEngine.SOFT_SKILLS) {
      if (AnalysisEngine.matchKeyword(lower, kw)) {
        found.add(
          kw
            .split(/[\s-]+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(kw.includes("-") ? "-" : " ")
        );
      }
    }
    for (const { pattern, label } of AnalysisEngine.SOFT_SKILL_PHRASES) {
      if (pattern.test(raw)) found.add(label);
    }
    return Array.from(found);
  }

  static readonly ACTION_VERBS = [
    "developed", "implemented", "designed", "built", "created", "optimized",
    "managed", "led", "improved", "increased", "reduced", "achieved",
    "delivered", "launched", "architected", "automated", "streamlined",
    "collaborated", "mentored", "analyzed", "resolved", "spearheaded",
    "engineered", "deployed", "integrated", "maintained", "refactored",
    "orchestrated", "pioneered", "transformed", "revamped", "accelerated",
    "negotiated", "facilitated", "coordinated", "established", "formulated",
    "supervised", "directed", "administered", "executed", "consolidated",
  ];

  // Comprehensive section patterns with all synonyms
  private static readonly SECTION_PATTERNS = {
    skills:   /\b(skills|technical\s+skills|core\s+competencies|key\s+skills|technologies|tools|proficiency|competencies|tech\s+stack|areas?\s+of\s+expertise|relevant\s+skills|professional\s+skills|technical\s+proficiency)\b/i,
    experience: /\b(experience|work\s+experience|professional\s+experience|employment|employment\s+history|work\s+history|career\s+history|job\s+experience|professional\s+background)\b/i,
    education: /\b(education|educational\s+background|academic\s+background|academic\s+qualifications|qualifications|degrees?|academics?|university|college|bachelor|master|phd|b\.?tech|m\.?tech|b\.?s\.?|m\.?s\.?|mba|diploma|certification|certifications?|institute|graduated|graduation)\b/i,
    projects: /\b(projects|personal\s+projects|academic\s+projects|key\s+projects|notable\s+projects|research\s+projects|side\s+projects|portfolio|open\s+source|contributions)\b/i,
    summary:  /\b(summary|professional\s+summary|career\s+summary|executive\s+summary|objective|career\s+objective|about\s+me|profile|personal\s+statement|introduction)\b/i,
    contact:  /\b(email|phone|address|linkedin|github|portfolio|website|contact|mobile)\b/i,
  };

  /** Lazy Porter stemmer — `natural` is not loaded until keyword matching runs (Vercel cold start). */
  private static get stemmer() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("natural") as typeof import("natural")).PorterStemmer;
  }

  /** Safe keyword match using word boundaries + semantic stemming
   *  "Collaboration" will match "Collaborated", "Collaborating", etc.
   */
  static matchKeyword(text: string, keyword: string): boolean {
    // Short keywords (1-2 chars) need strict word boundary
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (keyword.length <= 2) {
      return new RegExp(`(?:^|[\\s,;|/()\\[\\]])${escaped}(?:$|[\\s,;|/()\\[\\]])`, "i").test(text);
    }

    // 1. Exact word boundary match (fastest path)
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return true;

    // 2. Semantic stem match — handles "Collaboration" ↔ "Collaborated" etc.
    //    Only for single-word soft skills / verbs (not multi-word tech terms like "machine learning")
    if (!keyword.includes(" ") && keyword.length >= 4) {
      const keywordStem = this.stemmer.stem(keyword.toLowerCase());
      // Tokenize nearby context and check stems
      const words = text.split(/[\s,;|/()\[\].!?:]+/);
      for (const word of words) {
        if (word.length < 3) continue;
        if (this.stemmer.stem(word.toLowerCase()) === keywordStem) return true;
      }
    }

    // 3. Multi-word keyword: also try stemmed match for each word in the keyword
    if (keyword.includes(" ")) {
      const keywordParts = keyword.toLowerCase().split(/\s+/);
      const allPartsFound = keywordParts.every((part) => {
        if (part.length <= 2) return text.includes(part);
        const partStem = this.stemmer.stem(part);
        const words = text.split(/[\s,;|/()\[\].!?:]+/);
        return words.some((w) => w.length >= 3 && this.stemmer.stem(w.toLowerCase()) === partStem);
      });
      if (allPartsFound) return true;
    }

    return false;
  }

  // ─── Analyze Resume Text ───
  static analyzeResume(text: string, fileName: string) {
    const lowerText = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // ── Section Detection ──
    const hasSections = {
      skills: AnalysisEngine.SECTION_PATTERNS.skills.test(text),
      experience: AnalysisEngine.SECTION_PATTERNS.experience.test(text),
      education: AnalysisEngine.SECTION_PATTERNS.education.test(text),
      projects: AnalysisEngine.SECTION_PATTERNS.projects.test(text),
      summary: AnalysisEngine.SECTION_PATTERNS.summary.test(text),
      contact: AnalysisEngine.SECTION_PATTERNS.contact.test(text),
    };

    // ── Keyword Detection (using word boundaries) ──
    const foundTechKeywords = AnalysisEngine.TECH_KEYWORDS.filter((kw) =>
      AnalysisEngine.matchKeyword(lowerText, kw)
    );

    const foundSoftSkills = AnalysisEngine.findSoftSkillsInText(text);

    const foundActionVerbs = AnalysisEngine.ACTION_VERBS.filter((v) =>
      AnalysisEngine.matchKeyword(lowerText, v)
    );

    const missingTechKeywords = AnalysisEngine.TECH_KEYWORDS.filter(
      (kw) => !AnalysisEngine.matchKeyword(lowerText, kw)
    );

    // ── Score Calculation (real analysis) ──

    // Skills Score: based on tech keywords found + soft skills
    const techRatio = Math.min(foundTechKeywords.length / 8, 1); // 8+ tech skills = 100%
    const softRatio = Math.min(foundSoftSkills.length / 3, 1); // 3+ soft skills = 100%
    const skillsScore = Math.round(
      (techRatio * 0.7 + softRatio * 0.3) * 100 * (hasSections.skills ? 1 : 0.7)
    );

    // Experience Score: action verbs + experience section + word count
    const verbRatio = Math.min(foundActionVerbs.length / 6, 1);
    const lengthBonus = Math.min(wordCount / 300, 1); // 300+ words
    const experienceScore = Math.round(
      (verbRatio * 0.5 + lengthBonus * 0.3 + (hasSections.experience ? 0.2 : 0)) * 100
    );

    // Education Score: has education section + degree mentions
    const hasDegree = /\b(bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|mba|diploma|associate)\b/i.test(text);
    const hasUniversity = /\b(university|college|institute|school)\b/i.test(text);
    const hasGPA = /\b(gpa|cgpa|grade|percentage|marks)\b/i.test(text);
    const educationScore = Math.round(
      ((hasSections.education ? 40 : 10) +
        (hasDegree ? 25 : 0) +
        (hasUniversity ? 20 : 0) +
        (hasGPA ? 15 : 0))
    );

    // Projects Score: has projects section + github/portfolio mentions
    const hasGithub = /\b(github|gitlab|bitbucket)\b/i.test(text);
    const hasLinks = /https?:\/\//i.test(text);
    const projectKeywords = /\b(built|created|developed|deployed|launched)\b/i.test(text);
    const projectsScore = Math.round(
      ((hasSections.projects ? 40 : 10) +
        (hasGithub ? 20 : 0) +
        (hasLinks ? 15 : 0) +
        (projectKeywords ? 25 : 0))
    );

    // ATS Score: weighted average + formatting bonus
    const hasContactInfo = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(text); // email
    const hasPhone = /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text);
    const formattingBonus = (hasContactInfo ? 3 : 0) + (hasPhone ? 2 : 0) + (hasSections.summary ? 3 : 0);

    const atsScore = Math.min(
      Math.round(
        skillsScore * 0.3 +
        experienceScore * 0.3 +
        educationScore * 0.2 +
        projectsScore * 0.2 +
        formattingBonus
      ),
      100
    );

    // ── Select top relevant keywords ──
    const keywords = [
      ...foundTechKeywords.slice(0, 12),
      ...foundSoftSkills.slice(0, 4),
    ];

    // Only show missing keywords that are RELEVANT to the user's field
    // Don't show random tech keywords when we found nothing
    let missingKeywords: string[];
    if (foundTechKeywords.length > 0) {
      // User has some skills — suggest related ones they're missing
      missingKeywords = missingTechKeywords
        .filter((kw) => {
          // Only suggest keywords in similar categories to what user already has
          const hasWeb = foundTechKeywords.some((f) => ["react", "angular", "vue", "next.js", "node.js", "express", "html", "css", "javascript", "typescript"].includes(f));
          const hasData = foundTechKeywords.some((f) => ["python", "pandas", "numpy", "tensorflow", "pytorch", "machine learning", "data science", "data analysis"].includes(f));
          const hasDevOps = foundTechKeywords.some((f) => ["docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ci/cd"].includes(f));

          if (hasWeb && ["react", "typescript", "next.js", "tailwind", "jest", "cypress", "graphql", "redux", "node.js", "postgresql", "mongodb", "docker", "git"].includes(kw)) return true;
          if (hasData && ["tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "docker", "aws", "sql", "tableau", "power bi", "airflow", "spark"].includes(kw)) return true;
          if (hasDevOps && ["kubernetes", "terraform", "ansible", "jenkins", "prometheus", "grafana", "linux", "bash", "docker", "aws"].includes(kw)) return true;
          return false;
        })
        .slice(0, 6);
    } else {
      // No keywords found at all — don't show random missing keywords
      missingKeywords = [];
    }

    // ── Generate Smart Suggestions ──
    const suggestions = AnalysisEngine.generateSuggestions(
      skillsScore,
      experienceScore,
      educationScore,
      projectsScore,
      hasSections,
      foundTechKeywords,
      foundActionVerbs,
      missingKeywords,
      wordCount,
      text
    );

    return {
      atsScore: Math.max(atsScore, 5), // minimum 5%
      skillsScore: Math.min(skillsScore, 100),
      experienceScore: Math.min(experienceScore, 100),
      educationScore: Math.min(educationScore, 100),
      projectsScore: Math.min(projectsScore, 100),
      keywords,
      missingKeywords,
      suggestions,
    };
  }

  // ─── Job Description Matching ───
  static matchJob(resumeKeywords: string[], resumeText: string, jobDescription: string) {
    const jdLower = jobDescription.toLowerCase();
    const resumeLower = resumeText.toLowerCase();

    // Extract keywords from job description (using word boundary matching)
    const jdKeywords = [
      ...AnalysisEngine.TECH_KEYWORDS,
      ...AnalysisEngine.SOFT_SKILLS,
    ].filter((keyword) => AnalysisEngine.matchKeyword(jdLower, keyword));

    // If JD has no technical skills (e.g., only salary/benefits), return honest low match
    if (jdKeywords.length === 0) {
      return {
        overallScore: 30,
        skillMatch: 0,
        experienceMatch: 50,
        educationMatch: 50,
        keywordsFound: [] as string[],
        missingKeywords: [] as string[],
        suggestions: [
          "The job description doesn't contain specific technical skill requirements.",
          "Try pasting a job description with technical requirements for better matching.",
          "Look for keywords like programming languages, frameworks, and tools in the JD.",
        ],
      };
    }

    // Match JD keywords against resume (word boundary + deduplication)
    const matchedSet = new Set<string>();
    const missingSet = new Set<string>();

    for (const jk of jdKeywords) {
      const inResume = AnalysisEngine.matchKeyword(resumeLower, jk) ||
        resumeKeywords.some((rk) => rk.toLowerCase() === jk.toLowerCase());

      if (inResume) {
        matchedSet.add(jk);
      } else {
        missingSet.add(jk);
      }
    }

    // Remove any skill that's in both sets (shouldn't happen, but safety)
    for (const skill of matchedSet) {
      missingSet.delete(skill);
    }

    const foundKeywords = Array.from(matchedSet);
    const missingKeywords = Array.from(missingSet);

    // Skill match: what % of JD keywords are in resume
    const skillMatch =
      jdKeywords.length > 0
        ? Math.round((foundKeywords.length / jdKeywords.length) * 100)
        : 0;

    // Experience match: check for years of experience, action verbs
    const jdYears = jdLower.match(/(\d+)\+?\s*years?/);
    const resumeYears = resumeLower.match(/(\d+)\+?\s*years?/);
    let experienceMatch = 60;
    if (jdYears && resumeYears) {
      const required = parseInt(jdYears[1]);
      const has = parseInt(resumeYears[1]);
      experienceMatch = has >= required ? 95 : Math.round((has / required) * 85);
    }

    // Education match
    const jdRequiresDegree = /\b(bachelor|master|phd|degree)\b/i.test(jobDescription);
    const resumeHasDegree = /\b(bachelor|master|phd|b\.?s|m\.?s|b\.?tech|m\.?tech)\b/i.test(resumeText);
    const educationMatch = jdRequiresDegree
      ? resumeHasDegree ? 90 : 40
      : 75;

    const overallScore = Math.round(
      skillMatch * 0.4 + experienceMatch * 0.35 + educationMatch * 0.25
    );

    const suggestions = [
      missingKeywords.length > 0
        ? `Add these missing keywords to your resume: ${missingKeywords.slice(0, 4).join(", ")}`
        : "Great job! Your resume covers most of the required keywords.",
      "Quantify your achievements with numbers and metrics (e.g., 'increased performance by 40%')",
      "Tailor your experience section to highlight responsibilities matching this job",
      "Include relevant certifications or courses mentioned in the job description",
      "Use action verbs that align with the job responsibilities",
    ];

    return {
      overallScore: Math.min(overallScore, 100),
      skillMatch: Math.min(skillMatch, 100),
      experienceMatch: Math.min(experienceMatch, 100),
      educationMatch: Math.min(educationMatch, 100),
      keywordsFound: foundKeywords.slice(0, 15),
      missingKeywords: missingKeywords.slice(0, 8),
      suggestions,
    };
  }

  // ─── Generate Context-Aware Suggestions ───
  private static generateSuggestions(
    skills: number,
    experience: number,
    education: number,
    projects: number,
    hasSections: Record<string, boolean>,
    foundTech: string[],
    foundVerbs: string[],
    missingKeywords: string[],
    wordCount: number,
    text: string
  ): string[] {
    const suggestions: string[] = [];

    // Section suggestions
    if (!hasSections.summary) {
      suggestions.push(
        "Add a professional summary/objective at the top of your resume — ATS systems look for this section"
      );
    }
    if (!hasSections.skills) {
      suggestions.push(
        "Add a dedicated 'Skills' section listing your technical and soft skills for better ATS parsing"
      );
    }
    if (!hasSections.projects) {
      suggestions.push(
        "Add a 'Projects' section showcasing your work — this demonstrates practical experience"
      );
    }

    // Skills suggestions
    if (skills < 60) {
      if (missingKeywords.length > 0) {
        suggestions.push(
          `Your resume lacks technical keywords. Consider adding: ${missingKeywords.slice(0, 4).join(", ")}`
        );
      } else if (foundTech.length === 0) {
        suggestions.push(
          "No technical keywords were detected. Upload a text-based PDF (not scanned/image) for accurate keyword extraction."
        );
      } else {
        suggestions.push(
          "Add more technical skills relevant to your target role to improve your ATS score"
        );
      }
    }

    // Experience suggestions
    if (foundVerbs.length < 4) {
    suggestions.push(
        "Use more action verbs like 'developed', 'implemented', 'optimized', 'led' to describe your achievements"
    );
    }
    if (experience < 60) {
    suggestions.push(
        "Strengthen your experience section with quantifiable achievements (e.g., 'Reduced load time by 40%')"
    );
    }

    // Education suggestions
    if (education < 60) {
    suggestions.push(
        "Include relevant coursework, certifications, or academic honors in your education section"
      );
    }

    // Formatting suggestions
    if (wordCount < 150) {
      suggestions.push(
        "Your resume seems too short. Aim for 300-700 words with detailed descriptions of your work"
      );
    }
    if (wordCount > 1000) {
      suggestions.push(
        "Your resume is quite long. Keep it concise — 1-2 pages maximum with the most relevant information"
      );
    }

    // Contact info
    const hasEmail = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(text);
    if (!hasEmail) {
      suggestions.push(
        "Make sure to include your email address and contact information at the top"
      );
    }

    // GitHub/Portfolio
    const hasGithub = /\b(github|portfolio|linkedin)\b/i.test(text);
    if (!hasGithub) {
      suggestions.push(
        "Add links to your GitHub, LinkedIn, or portfolio to showcase your work online"
      );
    }

    // ATS formatting
    suggestions.push(
      "Ensure your resume uses standard section headings (Education, Experience, Skills) for ATS compatibility"
    );

    return suggestions.slice(0, 8); // max 8 suggestions
  }

  // ─── Interview Questions Generator ───
  static generateInterviewQuestions(text: string, keywords: string[]) {
    const lowerText = text.toLowerCase();
    const questions: { category: string; question: string; tip: string }[] = [];

    // ── Technical Questions based on detected skills ──
    const techMap: Record<string, { question: string; tip: string }[]> = {
      react: [
        { question: "Explain the difference between useState and useReducer. When would you use each?", tip: "Focus on complexity of state logic and when useReducer is preferable" },
        { question: "How does React's reconciliation algorithm work? What is the virtual DOM?", tip: "Discuss fiber architecture and diffing algorithm" },
        { question: "What are React Server Components and how do they differ from Client Components?", tip: "Discuss rendering strategies and when to use each" },
      ],
      typescript: [
        { question: "What are generics in TypeScript and how do they improve code reusability?", tip: "Use a real example like a generic API response handler" },
        { question: "Explain the difference between 'type' and 'interface' in TypeScript.", tip: "Cover declaration merging, extends vs intersection" },
      ],
      "node.js": [
        { question: "How does the Node.js event loop work? Explain the different phases.", tip: "Cover timers, I/O callbacks, idle, poll, check, close callbacks" },
        { question: "How would you handle error handling in a large Node.js application?", tip: "Discuss centralized error handling, custom error classes, async/await patterns" },
      ],
      python: [
        { question: "What are decorators in Python and how would you implement one?", tip: "Show a practical example like a timing or authentication decorator" },
        { question: "Explain the GIL (Global Interpreter Lock) and its impact on multithreading.", tip: "Discuss alternatives like multiprocessing and asyncio" },
      ],
      docker: [
        { question: "What is the difference between a Docker image and a container?", tip: "Use the class/instance analogy and discuss layers" },
        { question: "How do you optimize Docker images for production?", tip: "Multi-stage builds, .dockerignore, minimal base images" },
      ],
      aws: [
        { question: "Compare EC2, Lambda, and ECS. When would you use each?", tip: "Discuss cost, scaling, and use case tradeoffs" },
        { question: "How would you design a highly available application on AWS?", tip: "Multi-AZ, load balancers, auto-scaling, RDS replicas" },
      ],
      mongodb: [
        { question: "When would you choose MongoDB over a relational database?", tip: "Discuss schema flexibility, horizontal scaling, document model" },
        { question: "How do you handle data relationships in MongoDB?", tip: "Embedding vs referencing, denormalization strategies" },
      ],
      postgresql: [
        { question: "Explain indexes in PostgreSQL. How do they improve query performance?", tip: "B-tree, GIN, GiST indexes and when to use each" },
      ],
      "machine learning": [
        { question: "Explain the bias-variance tradeoff in machine learning.", tip: "Use examples of underfitting and overfitting" },
        { question: "How do you handle imbalanced datasets in classification problems?", tip: "SMOTE, class weights, oversampling, undersampling" },
      ],
      sql: [
        { question: "What is the difference between INNER JOIN, LEFT JOIN, and FULL OUTER JOIN?", tip: "Use Venn diagrams and practical examples" },
      ],
      git: [
        { question: "Explain git rebase vs git merge. When would you use each?", tip: "Discuss clean history vs preserving merge commits" },
      ],
      "rest api": [
        { question: "What are the key principles of RESTful API design?", tip: "Cover HTTP methods, status codes, resource naming, HATEOAS" },
      ],
      graphql: [
        { question: "What are the advantages and disadvantages of GraphQL compared to REST?", tip: "Over-fetching, under-fetching, caching complexity, N+1 problem" },
      ],
      kubernetes: [
        { question: "Explain Pods, Services, and Deployments in Kubernetes.", tip: "Cover the relationship between these resources and scaling" },
      ],
    };

    // Add technical questions based on found keywords
    for (const keyword of keywords) {
      const kw = keyword.toLowerCase();
      if (techMap[kw]) {
        for (const item of techMap[kw]) {
          questions.push({ category: "Technical", ...item });
        }
      }
    }

    // ── Behavioral Questions ──
    const behavioralQuestions = [
      { question: "Tell me about a time you had to deal with a difficult team member. How did you handle it?", tip: "Use the STAR method: Situation, Task, Action, Result" },
      { question: "Describe a situation where you had to meet a tight deadline. How did you prioritize?", tip: "Emphasize time management, communication, and delivery" },
      { question: "Tell me about a project that failed. What did you learn from it?", tip: "Show self-awareness, growth mindset, and lessons applied" },
      { question: "How do you stay updated with new technologies and industry trends?", tip: "Mention blogs, courses, communities, side projects" },
      { question: "Describe a time when you had to explain a complex technical concept to a non-technical person.", tip: "Focus on simplification, analogies, and empathy" },
    ];

    for (const item of behavioralQuestions) {
      questions.push({ category: "Behavioral", ...item });
    }

    // ── Experience-Based Questions ──
    if (/\b(lead|led|managed|team lead|senior)\b/i.test(text)) {
      questions.push({
        category: "Leadership",
        question: "How do you approach mentoring junior developers on your team?",
        tip: "Share specific examples of pair programming, code reviews, knowledge sharing",
      });
      questions.push({
        category: "Leadership",
        question: "How do you handle conflicting priorities between stakeholders?",
        tip: "Discuss prioritization frameworks, communication, and negotiation",
      });
    }

    if (/\b(agile|scrum|sprint|kanban)\b/i.test(text)) {
      questions.push({
        category: "Process",
        question: "How do you estimate story points and manage sprint velocity?",
        tip: "Discuss planning poker, historical velocity, and buffer for unknowns",
      });
    }

    if (/\b(ci\/cd|deployment|devops)\b/i.test(text)) {
      questions.push({
        category: "DevOps",
        question: "Walk me through your ideal CI/CD pipeline from commit to production.",
        tip: "Cover linting, testing, staging, canary deployments, rollback strategies",
      });
    }

    // ── System Design (for experienced candidates) ──
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 300 || /\b(architect|senior|lead|principal)\b/i.test(text)) {
      questions.push({
        category: "System Design",
        question: "How would you design a URL shortener like bit.ly at scale?",
        tip: "Cover database design, hashing, caching, load balancing, analytics",
      });
      questions.push({
        category: "System Design",
        question: "Design a real-time notification system for a social media app.",
        tip: "Discuss WebSockets, message queues, push notifications, fan-out patterns",
      });
    }

    return {
      totalQuestions: questions.length,
      questions: questions.slice(0, 20), // max 20 questions
    };
  }

  // ─── Smart Feedback: Line-by-Line Resume Review ───
  static generateSmartFeedback(text: string) {
    // Weak/generic patterns that need improvement
    const WEAK_PATTERNS: {
      pattern: RegExp;
      issue: string;
      category: "weak_verb" | "generic" | "no_metrics" | "passive_voice" | "too_vague";
      rewriteFn: (line: string) => string;
    }[] = [
      {
        pattern: /^responsible for\s+/i,
        issue: "Starts with 'Responsible for' — a weak, passive phrase",
        category: "weak_verb",
        rewriteFn: (line) => {
          const rest = line.replace(/^responsible for\s+/i, "");
          const verb = rest.match(/^(managing|developing|creating|handling|maintaining|building|designing|testing|leading|writing)/i);
          if (verb) {
            const actionMap: Record<string, string> = {
              managing: "Managed", developing: "Developed", creating: "Created",
              handling: "Handled", maintaining: "Maintained", building: "Built",
              designing: "Designed", testing: "Tested", leading: "Led", writing: "Wrote",
            };
            const mapped = actionMap[verb[1].toLowerCase()] || verb[1].charAt(0).toUpperCase() + verb[1].slice(1);
            return `${mapped} ${rest.replace(verb[0], "").trim()}, resulting in measurable improvement`;
          }
          return `Led ${rest.trim()}, delivering measurable results`;
        },
      },
      {
        pattern: /^worked on\s+/i,
        issue: "'Worked on' is vague — what was your specific contribution?",
        category: "too_vague",
        rewriteFn: (line) => {
          const rest = line.replace(/^worked on\s+/i, "");
          return `Developed and delivered ${rest.trim()}, improving team efficiency`;
        },
      },
      {
        pattern: /^helped\s+(with\s+)?/i,
        issue: "'Helped' minimizes your role — own your contribution",
        category: "weak_verb",
        rewriteFn: (line) => {
          const rest = line.replace(/^helped\s+(with\s+)?/i, "");
          return `Contributed to ${rest.trim()}, driving key improvements`;
        },
      },
      {
        pattern: /^assisted\s+(in\s+|with\s+)?/i,
        issue: "'Assisted' downplays your impact — use a stronger verb",
        category: "weak_verb",
        rewriteFn: (line) => {
          const rest = line.replace(/^assisted\s+(in\s+|with\s+)?/i, "");
          return `Collaborated on ${rest.trim()}, achieving significant outcomes`;
        },
      },
      {
        pattern: /^(did|do|does|doing)\s+/i,
        issue: "Very weak verb — replace with a specific action verb",
        category: "weak_verb",
        rewriteFn: (line) => {
          const rest = line.replace(/^(did|do|does|doing)\s+/i, "");
          return `Executed ${rest.trim()} with measurable results`;
        },
      },
      {
        pattern: /^(was involved in|participated in|took part in)\s+/i,
        issue: "Passive participation — describe what YOU specifically did",
        category: "passive_voice",
        rewriteFn: (line) => {
          const rest = line.replace(/^(was involved in|participated in|took part in)\s+/i, "");
          return `Spearheaded ${rest.trim()}, contributing to team success`;
        },
      },
      {
        pattern: /^(good|strong|excellent)\s+(knowledge|understanding|skills)\s+(in|of|with)\s+/i,
        issue: "Self-assessment without proof — show it through achievements",
        category: "generic",
        rewriteFn: (line) => {
          const match = line.match(/(in|of|with)\s+(.+)/i);
          const skill = match ? match[2].trim() : "relevant technologies";
          return `Applied ${skill} to deliver production-ready solutions`;
        },
      },
      {
        pattern: /team\s*player/i,
        issue: "'Team player' is a cliché — demonstrate collaboration with examples",
        category: "generic",
        rewriteFn: () => "Collaborated with cross-functional teams of 5+ members to deliver projects on schedule",
      },
      {
        pattern: /hard\s*work(er|ing)/i,
        issue: "'Hard worker' is generic — show work ethic through results",
        category: "generic",
        rewriteFn: () => "Consistently exceeded sprint targets, delivering 20% more story points than team average",
      },
      {
        pattern: /self[- ]?motivated/i,
        issue: "'Self-motivated' is a filler — prove it with initiative",
        category: "generic",
        rewriteFn: () => "Proactively identified and resolved 15+ production bugs, reducing downtime by 30%",
      },
      {
        pattern: /detail[- ]?oriented/i,
        issue: "'Detail-oriented' is overused — show attention to detail through outcomes",
        category: "generic",
        rewriteFn: () => "Implemented comprehensive testing suite achieving 95% code coverage",
      },
    ];

    // No-metrics detection
    const HAS_METRICS = /\d+%|\d+\+|\$\d|\d+\s*(users|customers|clients|projects|teams|members|applications|requests|hours|days|weeks|months)/i;

    // Split text into meaningful lines (bullet points / sentences)
    const lines = text
      .split(/[\n\r]+/)
      .map((l) => l.replace(/^[\s•\-–—*▪▸►●○◦·]+/, "").trim())
      .filter((l) => l.length > 15 && l.length < 300) // reasonable bullet point length
      .filter((l) => !/^(education|experience|skills|projects|contact|summary|objective|name|email|phone|address|university|college)/i.test(l));

    const feedback: {
      original: string;
      improved: string;
      issue: string;
      category: string;
      severity: "high" | "medium" | "low";
    }[] = [];

    for (const line of lines) {
      // Check against weak patterns
      let matched = false;
      for (const wp of WEAK_PATTERNS) {
        if (wp.pattern.test(line)) {
          feedback.push({
            original: line,
            improved: wp.rewriteFn(line),
            issue: wp.issue,
            category: wp.category,
            severity: wp.category === "weak_verb" || wp.category === "passive_voice" ? "high" : "medium",
          });
          matched = true;
          break;
        }
      }

      if (matched) continue;

      // Check for lines without metrics (only experience-like lines)
      const looksLikeExperience = /^(developed|built|created|managed|led|designed|implemented|optimized|improved|maintained|delivered|collaborated|analyzed)/i.test(line);
      if (looksLikeExperience && !HAS_METRICS.test(line) && line.split(/\s+/).length > 5) {
        feedback.push({
          original: line,
          improved: line.replace(/\.?\s*$/, ", resulting in a 25% improvement in efficiency"),
          issue: "Missing quantifiable metrics — add numbers to show impact",
          category: "no_metrics",
          severity: "medium",
        });
        continue;
      }

      // Check for very short bullet points
      if (line.split(/\s+/).length <= 5 && line.split(/\s+/).length > 2) {
        feedback.push({
          original: line,
          improved: `${line} — include specific tools, technologies, and measurable outcomes`,
          issue: "Too brief — expand with details and impact",
          category: "too_vague",
          severity: "low",
        });
      }
    }

    // Summary stats
    const totalLines = lines.length;
    const issueCount = feedback.length;
    const highCount = feedback.filter((f) => f.severity === "high").length;
    const mediumCount = feedback.filter((f) => f.severity === "medium").length;
    const lowCount = feedback.filter((f) => f.severity === "low").length;
    const score = totalLines > 0 ? Math.max(0, Math.round(100 - (issueCount / totalLines) * 100)) : 50;

    return {
      score,
      totalLinesScanned: totalLines,
      issuesFound: issueCount,
      summary: {
        high: highCount,
        medium: mediumCount,
        low: lowCount,
      },
      feedback: feedback.slice(0, 15), // max 15 items
    };
  }

  // ─── AI Resume Rewriter ───
  static rewriteBulletPoint(text: string): { original: string; rewritten: string; changes: string[] } {
    const original = text.trim();
    const lower = original.toLowerCase();
    let rewritten = original;
    const changes: string[] = [];

    // 1. Replace weak opening verbs
    const weakVerbs: Record<string, string> = {
      "worked on": "Developed",
      "worked with": "Collaborated on",
      "responsible for": "Led",
      "helped with": "Contributed to",
      "helped": "Facilitated",
      "assisted in": "Supported",
      "assisted with": "Supported",
      "assisted": "Supported",
      "was involved in": "Spearheaded",
      "participated in": "Engaged in",
      "took part in": "Contributed to",
      "did": "Executed",
      "made": "Created",
      "used": "Leveraged",
      "handled": "Managed",
      "dealt with": "Resolved",
      "looked after": "Oversaw",
      "had to": "Proactively",
      "tasked with": "Drove",
    };

    for (const [weak, strong] of Object.entries(weakVerbs)) {
      if (lower.startsWith(weak)) {
        rewritten = strong + rewritten.slice(weak.length);
        changes.push(`Replaced weak verb "${weak}" → "${strong}"`);
        break;
      }
    }

    // 2. Add metrics if missing
    const hasMetrics = /\d+%|\d+\+|\$\d|\d+\s*(users|clients|projects|requests|people|team|members)/i.test(rewritten);
    if (!hasMetrics && rewritten.split(/\s+/).length > 4) {
      // Detect context and add appropriate metric
      if (/\b(performance|speed|load|fast|optimi)/i.test(rewritten)) {
        rewritten = rewritten.replace(/\.?\s*$/, ", improving performance by 40%");
        changes.push("Added performance metric");
      } else if (/\b(team|collaborat|cross.?functional)/i.test(rewritten)) {
        rewritten = rewritten.replace(/\.?\s*$/, " across a team of 8+ members");
        changes.push("Added team size metric");
      } else if (/\b(user|customer|client)/i.test(rewritten)) {
        rewritten = rewritten.replace(/\.?\s*$/, ", impacting 10,000+ users");
        changes.push("Added user impact metric");
      } else if (/\b(test|bug|quality|QA)/i.test(rewritten)) {
        rewritten = rewritten.replace(/\.?\s*$/, ", achieving 95% code coverage");
        changes.push("Added quality metric");
      } else if (/\b(deploy|release|ship|launch)/i.test(rewritten)) {
        rewritten = rewritten.replace(/\.?\s*$/, ", reducing deployment time by 60%");
        changes.push("Added deployment metric");
      } else {
        rewritten = rewritten.replace(/\.?\s*$/, ", resulting in a 25% efficiency improvement");
        changes.push("Added impact metric");
      }
    }

    // 3. Add technology specifics if too generic
    const hasTech = /\b(python|javascript|typescript|react|node|java|sql|aws|docker|kubernetes|tensorflow|pytorch|angular|vue|express|mongodb|postgresql|git)/i.test(rewritten);
    if (!hasTech && /\b(develop|built|creat|implement|design|code|program)/i.test(lower)) {
      const techToAdd = /\b(web|frontend|front.end)/i.test(rewritten) ? "using React and TypeScript"
        : /\b(backend|server|api)/i.test(rewritten) ? "using Node.js and Express"
        : /\b(data|analy|model|ml|machine.learning)/i.test(rewritten) ? "using Python and Scikit-Learn"
        : /\b(mobile|app)/i.test(rewritten) ? "using React Native"
        : /\b(databas|query)/i.test(rewritten) ? "using PostgreSQL and MongoDB"
        : "";

      if (techToAdd) {
        // Insert tech before any metric we added
        const metricPattern = /, (resulting|improving|impacting|achieving|reducing|across)/;
        if (metricPattern.test(rewritten)) {
          rewritten = rewritten.replace(metricPattern, ` ${techToAdd},$1`).replace(/,(\w)/, ", $1");
        } else {
          rewritten = rewritten.replace(/\.?\s*$/, ` ${techToAdd}`);
        }
        changes.push("Added specific technologies");
      }
    }

    // 4. Ensure proper capitalization and punctuation
    if (rewritten && rewritten[0] !== rewritten[0].toUpperCase()) {
      rewritten = rewritten[0].toUpperCase() + rewritten.slice(1);
      changes.push("Fixed capitalization");
    }

    if (changes.length === 0) {
      changes.push("Already well-written — no major changes needed");
    }

    return { original, rewritten, changes };
  }

  // ─── Section Analyzer (detailed per-section) ───
  static analyzeSections(text: string) {
    const sections = [
      {
        name: "Summary",
        pattern: /\b(summary|objective|about|profile|introduction)\b/i,
        found: false,
        score: 0,
        grade: "F",
        issues: [] as string[],
        tips: [] as string[],
      },
      {
        name: "Experience",
        pattern: /\b(experience|work experience|employment|professional experience|work history)\b/i,
        found: false,
        score: 0,
        grade: "F",
        issues: [] as string[],
        tips: [] as string[],
      },
      {
        name: "Skills",
        pattern: /\b(skills|technical skills|technologies|tools|proficiency|competencies|tech stack)\b/i,
        found: false,
        score: 0,
        grade: "F",
        issues: [] as string[],
        tips: [] as string[],
      },
      {
        name: "Projects",
        pattern: /\b(projects|portfolio|personal projects|open source|contributions)\b/i,
        found: false,
        score: 0,
        grade: "F",
        issues: [] as string[],
        tips: [] as string[],
      },
      {
        name: "Education",
        pattern: /\b(education|degree|university|college|academic)\b/i,
        found: false,
        score: 0,
        grade: "F",
        issues: [] as string[],
        tips: [] as string[],
      },
    ];

    const lower = text.toLowerCase();
    const HAS_METRICS = /\d+%|\d+\+|\$\d/;
    const ACTION_VERBS = /\b(developed|implemented|designed|built|created|optimized|managed|led|improved|increased|reduced|achieved|delivered|launched|architected|automated|streamlined|collaborated|mentored|analyzed|resolved|spearheaded|engineered|deployed|integrated)\b/i;

    // Analyze Summary
    const summarySection = sections[0];
    summarySection.found = summarySection.pattern.test(text);
    if (summarySection.found) {
      let s = 50;
      if (text.length > 100) s += 15;
      if (ACTION_VERBS.test(lower.slice(0, 500))) s += 15;
      if (/\b\d+\s*\+?\s*years?\b/i.test(text)) { s += 10; } else { summarySection.issues.push("No years of experience mentioned"); }
      if (lower.slice(0, 500).split(/\s+/).length > 20) s += 10;
      summarySection.score = Math.min(s, 100);
      summarySection.tips.push("Keep your summary to 2-3 impactful sentences");
      summarySection.tips.push("Mention your years of experience and key technologies");
    } else {
      summarySection.score = 0;
      summarySection.issues.push("No summary/objective section found");
      summarySection.tips.push("Add a professional summary at the top — it's the first thing recruiters read");
      summarySection.tips.push("Include your title, years of experience, and top 3 skills");
    }

    // Analyze Experience
    const expSection = sections[1];
    expSection.found = expSection.pattern.test(text);
    if (expSection.found) {
      let s = 40;
      const verbCount = (lower.match(new RegExp(ACTION_VERBS.source, "gi")) || []).length;
      s += Math.min(verbCount * 5, 25);
      if (verbCount < 3) expSection.issues.push("Too few action verbs — use 'Developed', 'Led', 'Optimized'");
      if (HAS_METRICS.test(text)) { s += 15; } else { expSection.issues.push("No quantifiable metrics found"); }
      if (/\b(company|inc|ltd|corp|llc|startup)\b/i.test(text)) s += 10;
      if (/\b(20\d{2}|present|current)\b/i.test(text)) s += 10;
      else expSection.issues.push("No dates/timeline found");
      expSection.score = Math.min(s, 100);
      expSection.tips.push("Start each bullet with a strong action verb");
      expSection.tips.push("Add metrics: 'Reduced load time by 40%' instead of 'Improved performance'");
    } else {
      expSection.score = 0;
      expSection.issues.push("No experience section found");
      expSection.tips.push("Add work experience with company name, title, dates, and bullet points");
    }

    // Analyze Skills
    const skillsSection = sections[2];
    skillsSection.found = skillsSection.pattern.test(text);
    if (skillsSection.found) {
      let s = 40;
      const techCount = AnalysisEngine.TECH_KEYWORDS.filter(k => lower.includes(k)).length;
      s += Math.min(techCount * 4, 30);
      if (techCount < 5) skillsSection.issues.push(`Only ${techCount} technical skills detected — add more`);
      const softCount = AnalysisEngine.SOFT_SKILLS.filter(k => lower.includes(k)).length;
      s += Math.min(softCount * 5, 15);
      if (softCount === 0) skillsSection.issues.push("No soft skills mentioned");
      if (/\b(proficient|advanced|intermediate|beginner|expert)\b/i.test(text)) s += 15;
      else skillsSection.issues.push("No skill proficiency levels indicated");
      skillsSection.score = Math.min(s, 100);
      skillsSection.tips.push("Group skills by category: Languages, Frameworks, Tools, Databases");
      skillsSection.tips.push("Add proficiency levels: Expert, Advanced, Intermediate");
    } else {
      skillsSection.score = 0;
      skillsSection.issues.push("No dedicated skills section found");
      skillsSection.tips.push("Add a 'Technical Skills' section — ATS systems scan this first");
    }

    // Analyze Projects
    const projSection = sections[3];
    projSection.found = projSection.pattern.test(text);
    if (projSection.found) {
      let s = 40;
      if (/https?:\/\//i.test(text)) { s += 15; } else { projSection.issues.push("No project links found"); }
      if (/\b(github|gitlab|bitbucket)\b/i.test(text)) { s += 10; } else { projSection.issues.push("No GitHub/repository links"); }
      if (ACTION_VERBS.test(text)) s += 15;
      if (/\b(built|created|developed|launched|deployed)\b/i.test(text)) s += 20;
      else projSection.issues.push("Missing action verbs describing what you built");
      projSection.score = Math.min(s, 100);
      projSection.tips.push("Include live links and GitHub repos");
      projSection.tips.push("Describe the tech stack and your specific role for each project");
    } else {
      projSection.score = 0;
      projSection.issues.push("No projects section found");
      projSection.tips.push("Add 2-3 projects with description, tech stack, and links");
    }

    // Analyze Education — Deep scan: education info may appear ANYWHERE in the document
    const eduSection = sections[4];
    // Check for explicit section header OR any education-related content anywhere in the text
    const hasEduHeader = eduSection.pattern.test(text);
    const hasEduContent = /\b(bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|mba|bca|mca|diploma|associate|b\.?sc|m\.?sc|b\.?a\.?|m\.?a\.?|b\.?com|m\.?com)\b/i.test(text)
      || /\b(university|college|institute|school of|faculty of|graduated|graduation|alma mater)\b/i.test(text)
      || /\b(degree|gpa|cgpa|academic|semester|coursework)\b/i.test(text);
    eduSection.found = hasEduHeader || hasEduContent;
    if (eduSection.found) {
      let s = 50;
      if (/\b(bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|mba|bca|mca|diploma|associate|b\.?sc|m\.?sc|b\.?a\.?|m\.?a\.?|b\.?com|m\.?com)\b/i.test(text)) s += 20;
      else eduSection.issues.push("No degree type mentioned");
      if (/\b(university|college|institute|school of)\b/i.test(text)) s += 15;
      if (/\b(gpa|cgpa|grade|percentage|honors|distinction|cum laude|summa|magna)\b/i.test(text)) s += 15;
      else eduSection.issues.push("No GPA or academic honors mentioned");
      eduSection.score = Math.min(s, 100);
      eduSection.tips.push("Include GPA if above 3.0 (or equivalent)");
      eduSection.tips.push("Add relevant coursework or academic achievements");
      if (!hasEduHeader) {
        eduSection.tips.push("Consider adding an explicit 'Education' section header for better ATS parsing");
      }
    } else {
      eduSection.score = 0;
      eduSection.issues.push("No education section found");
      eduSection.tips.push("Add your degree, university, graduation year, and GPA");
    }

    // Assign letter grades
    for (const section of sections) {
      section.grade = section.score >= 90 ? "A+" : section.score >= 80 ? "A" : section.score >= 70 ? "B" : section.score >= 60 ? "C" : section.score >= 40 ? "D" : "F";
    }

    const overall = Math.round(sections.reduce((a, s) => a + s.score, 0) / sections.length);

    return { overall, sections };
  }

  // ─── Industry / Field Detection ───
  static detectIndustry(text: string) {
    const lower = text.toLowerCase();

    const industries: { name: string; keywords: string[]; recommended: string[] }[] = [
      {
        name: "Data Science & Machine Learning",
        keywords: ["machine learning", "deep learning", "data science", "data analysis", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "nlp", "computer vision", "data mining", "statistics", "regression", "classification", "neural network"],
        recommended: ["Python", "R", "SQL", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Scikit-Learn", "Tableau", "Power BI", "Apache Spark", "AWS SageMaker", "MLOps", "Docker", "Statistics"],
      },
      {
        name: "Web Development",
        keywords: ["react", "angular", "vue", "next.js", "html", "css", "javascript", "typescript", "node.js", "express", "frontend", "backend", "full stack", "web app", "rest api", "graphql"],
        recommended: ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "MongoDB", "Docker", "AWS", "CI/CD", "Git", "Tailwind CSS", "Redis", "GraphQL", "Testing (Jest)", "Figma"],
      },
      {
        name: "Mobile Development",
        keywords: ["react native", "flutter", "swift", "kotlin", "ios", "android", "mobile app", "xcode", "android studio"],
        recommended: ["React Native", "Flutter", "Swift", "Kotlin", "Firebase", "REST APIs", "Git", "CI/CD", "App Store Optimization", "UI/UX Design", "TypeScript", "Redux"],
      },
      {
        name: "Cloud & DevOps",
        keywords: ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "jenkins", "devops", "cloud", "infrastructure", "ansible", "monitoring"],
        recommended: ["AWS", "Docker", "Kubernetes", "Terraform", "Linux", "CI/CD", "Jenkins", "Ansible", "Prometheus", "Grafana", "Python", "Bash", "Git", "Networking", "Security"],
      },
      {
        name: "Cybersecurity",
        keywords: ["security", "penetration testing", "vulnerability", "firewall", "encryption", "soc", "siem", "incident response", "threat", "malware", "forensics"],
        recommended: ["Network Security", "Penetration Testing", "SIEM Tools", "Incident Response", "Python", "Linux", "Wireshark", "Burp Suite", "OWASP", "Compliance (SOC2/ISO)", "Cryptography"],
      },
      {
        name: "UI/UX Design",
        keywords: ["figma", "ui/ux", "user experience", "user interface", "wireframe", "prototype", "design system", "usability", "sketch", "adobe xd"],
        recommended: ["Figma", "Adobe XD", "Sketch", "Prototyping", "User Research", "Wireframing", "Design Systems", "HTML/CSS", "Accessibility (WCAG)", "Interaction Design"],
      },
      {
        name: "Blockchain & Web3",
        keywords: ["blockchain", "solidity", "smart contract", "ethereum", "web3", "defi", "nft", "crypto", "hardhat"],
        recommended: ["Solidity", "Ethereum", "Hardhat", "Web3.js", "React", "Node.js", "IPFS", "Smart Contract Security", "DeFi Protocols", "TypeScript"],
      },
      {
        name: "Project Management",
        keywords: ["project management", "scrum", "agile", "kanban", "jira", "stakeholder", "risk management", "pmp", "sprint", "product owner"],
        recommended: ["Agile/Scrum", "Jira", "Confluence", "Risk Management", "Stakeholder Management", "Budgeting", "PMP Certification", "Communication", "Leadership", "MS Project"],
      },
    ];

    const detected: { name: string; confidence: number; matchedKeywords: string[]; recommendedSkills: string[] }[] = [];

    for (const industry of industries) {
      const matched = industry.keywords.filter((k) => lower.includes(k));
      if (matched.length >= 2) {
        const confidence = Math.min(Math.round((matched.length / industry.keywords.length) * 100), 100);
        const alreadyHave = industry.recommended.filter((r) => lower.includes(r.toLowerCase()));
        const missing = industry.recommended.filter((r) => !lower.includes(r.toLowerCase()));
        detected.push({
          name: industry.name,
          confidence,
          matchedKeywords: matched,
          recommendedSkills: missing.slice(0, 8),
        });
      }
    }

    detected.sort((a, b) => b.confidence - a.confidence);

    return {
      detectedIndustries: detected.slice(0, 3),
      primaryField: detected[0]?.name || "General / Not Detected",
    };
  }

  // ─── Readability Score ───
  static analyzeReadability(text: string) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const words = text.split(/\s+/).filter(Boolean);
    const bulletPoints = text.split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 10);

    const totalSentences = sentences.length || 1;
    const totalWords = words.length || 1;

    // Average sentence length
    const avgSentenceLength = Math.round(totalWords / totalSentences);

    // Average word length (complexity indicator)
    const avgWordLength = +(words.reduce((a, w) => a + w.length, 0) / totalWords).toFixed(1);

    // Long sentences (>25 words)
    const longSentences = sentences.filter((s) => s.split(/\s+/).length > 25).length;

    // Very long bullet points (>30 words)
    const longBullets = bulletPoints.filter((b) => b.split(/\s+/).length > 30).length;

    // Short bullets (good for ATS)
    const shortBullets = bulletPoints.filter((b) => {
      const wc = b.split(/\s+/).length;
      return wc >= 5 && wc <= 20;
    }).length;

    // Passive voice indicators
    const passiveCount = (text.match(/\b(was|were|been|being|is|are)\s+(being\s+)?\w+ed\b/gi) || []).length;

    // Jargon / complexity
    const complexWords = words.filter((w) => w.length > 12).length;

    // Calculate readability score (0-100)
    let score = 70; // baseline

    // Sentence length impact
    if (avgSentenceLength <= 15) score += 10;
    else if (avgSentenceLength <= 20) score += 5;
    else if (avgSentenceLength > 30) score -= 15;
    else if (avgSentenceLength > 25) score -= 10;

    // Long sentences penalty
    score -= longSentences * 3;

    // Passive voice penalty
    score -= passiveCount * 2;

    // Complex words penalty
    score -= Math.min(complexWords * 1, 10);

    // Short bullet bonus
    score += Math.min(shortBullets * 2, 10);

    // Long bullets penalty
    score -= longBullets * 3;

    score = Math.max(0, Math.min(100, score));

    // Generate tips
    const tips: string[] = [];
    if (avgSentenceLength > 20) tips.push(`Average sentence is ${avgSentenceLength} words — aim for 10-15 words per bullet point`);
    if (longSentences > 2) tips.push(`${longSentences} sentences are too long (25+ words) — break them into shorter bullets`);
    if (longBullets > 1) tips.push(`${longBullets} bullet points are too wordy — keep each to 1-2 lines`);
    if (passiveCount > 2) tips.push(`${passiveCount} passive voice instances found — use active voice ("Developed" not "Was developed")`);
    if (complexWords > 5) tips.push(`${complexWords} overly complex words — use simpler language for ATS compatibility`);
    if (avgWordLength > 6) tips.push("Average word length is high — simplify vocabulary where possible");
    if (shortBullets < 3) tips.push("Use more concise bullet points (5-20 words each) for better readability");
    if (tips.length === 0) tips.push("Great readability! Your resume is clear and concise");

    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

    return {
      score,
      grade,
      metrics: {
        avgSentenceLength,
        avgWordLength,
        totalSentences,
        totalWords,
        longSentences,
        longBullets,
        shortBullets,
        passiveVoice: passiveCount,
        complexWords,
      },
      tips,
    };
  }

  // ─── Hiring Probability Score ───
  static calculateHiringProbability(text: string, atsScore: number, analysis: { skillsScore: number; experienceScore: number; educationScore: number; projectsScore: number; keywords: string[]; missingKeywords: string[] } | null) {
    const lower = text.toLowerCase();
    const sk = analysis?.skillsScore || 0;
    const ex = analysis?.experienceScore || 0;
    const ed = analysis?.educationScore || 0;
    const pr = analysis?.projectsScore || 0;
    const kw = analysis?.keywords?.length || 0;
    const miss = analysis?.missingKeywords?.length || 0;

    // Weighted factors
    const atsWeight = atsScore * 0.25;
    const skillsWeight = sk * 0.20;
    const expWeight = ex * 0.20;
    const eduWeight = ed * 0.10;
    const projWeight = pr * 0.10;
    const kwCoverage = kw > 0 ? Math.min((kw / (kw + miss)) * 100, 100) * 0.10 : 0;

    // Bonuses
    let bonus = 0;
    if (/\b(github|portfolio|linkedin)\b/i.test(text)) bonus += 2;
    if (/https?:\/\//i.test(text)) bonus += 1;
    if (/\b\d+%|\d+\s*(users|clients|projects)/i.test(text)) bonus += 2;
    if (/\b(certified|certification|pmp|aws.certified)\b/i.test(text)) bonus += 3;

    const raw = atsWeight + skillsWeight + expWeight + eduWeight + projWeight + kwCoverage + bonus;
    const probability = Math.min(Math.max(Math.round(raw), 5), 95);

    const factors = [
      { name: "ATS Score", value: atsScore, weight: "25%", impact: atsScore >= 70 ? "positive" as const : "negative" as const },
      { name: "Skills Match", value: sk, weight: "20%", impact: sk >= 60 ? "positive" as const : "negative" as const },
      { name: "Experience", value: ex, weight: "20%", impact: ex >= 60 ? "positive" as const : "negative" as const },
      { name: "Education", value: ed, weight: "10%", impact: ed >= 60 ? "positive" as const : "negative" as const },
      { name: "Projects", value: pr, weight: "10%", impact: pr >= 50 ? "positive" as const : "negative" as const },
      { name: "Keyword Coverage", value: Math.round(kwCoverage * 10), weight: "10%", impact: kwCoverage >= 5 ? "positive" as const : "negative" as const },
      { name: "Online Presence", value: bonus > 3 ? 90 : bonus > 1 ? 60 : 20, weight: "5%", impact: bonus > 1 ? "positive" as const : "negative" as const },
    ];

    const verdict = probability >= 80 ? "Very High — You're a strong candidate! 🔥" : probability >= 65 ? "Good — Solid chances with minor improvements 👍" : probability >= 45 ? "Moderate — Focus on weak areas to increase chances" : "Low — Significant improvements needed";

    return { probability, factors, verdict };
  }

  // ─── Global Benchmark ───
  static getGlobalBenchmark(atsScore: number, analysis: { skillsScore: number; experienceScore: number; educationScore: number; projectsScore: number } | null) {
    // Simulated global distribution (based on typical ATS score distributions)
    const globalAvg = 58;
    const globalMedian = 55;
    const globalTop10 = 82;
    const globalTop25 = 72;

    const userScore = atsScore;
    const percentile = userScore >= 90 ? 97 : userScore >= 85 ? 93 : userScore >= 80 ? 88 : userScore >= 75 ? 80 : userScore >= 70 ? 72 : userScore >= 65 ? 60 : userScore >= 60 ? 50 : userScore >= 50 ? 35 : userScore >= 40 ? 20 : 10;

    const rank = percentile >= 90 ? "Top 10% 🏆" : percentile >= 75 ? "Top 25% ⭐" : percentile >= 50 ? "Above Average" : percentile >= 25 ? "Below Average" : "Bottom 25%";

    const comparisons = [
      { label: "Your Score", value: userScore, highlight: true },
      { label: "Global Average", value: globalAvg, highlight: false },
      { label: "Global Median", value: globalMedian, highlight: false },
      { label: "Top 25%", value: globalTop25, highlight: false },
      { label: "Top 10%", value: globalTop10, highlight: false },
    ];

    const sectionBenchmarks = [
      { section: "Skills", yours: analysis?.skillsScore || 0, average: 55 },
      { section: "Experience", yours: analysis?.experienceScore || 0, average: 52 },
      { section: "Education", yours: analysis?.educationScore || 0, average: 60 },
      { section: "Projects", yours: analysis?.projectsScore || 0, average: 42 },
    ];

    return { percentile, rank, comparisons, sectionBenchmarks, beatsPercent: percentile };
  }

  // ─── Gamification Badges ───
  static calculateBadges(text: string, atsScore: number, analysis: { skillsScore: number; experienceScore: number; educationScore: number; projectsScore: number; keywords: string[]; suggestions: string[] } | null) {
    const lower = text.toLowerCase();
    const badges: { id: string; name: string; icon: string; description: string; earned: boolean; progress: number }[] = [];

    badges.push({
      id: "ats_optimized", name: "ATS Optimized", icon: "🏅",
      description: "Score 70%+ on ATS compatibility",
      earned: atsScore >= 70, progress: Math.min(Math.round((atsScore / 70) * 100), 100),
    });
    badges.push({
      id: "keyword_master", name: "Keyword Master", icon: "🔑",
      description: "Include 10+ relevant technical keywords",
      earned: (analysis?.keywords?.length || 0) >= 10, progress: Math.min(Math.round(((analysis?.keywords?.length || 0) / 10) * 100), 100),
    });
    badges.push({
      id: "strong_experience", name: "Strong Experience", icon: "💪",
      description: "Score 75%+ in Experience section",
      earned: (analysis?.experienceScore || 0) >= 75, progress: Math.min(Math.round(((analysis?.experienceScore || 0) / 75) * 100), 100),
    });
    badges.push({
      id: "skill_champion", name: "Skill Champion", icon: "⚡",
      description: "Score 80%+ in Skills section",
      earned: (analysis?.skillsScore || 0) >= 80, progress: Math.min(Math.round(((analysis?.skillsScore || 0) / 80) * 100), 100),
    });
    badges.push({
      id: "project_builder", name: "Project Builder", icon: "🚀",
      description: "Score 60%+ in Projects section",
      earned: (analysis?.projectsScore || 0) >= 60, progress: Math.min(Math.round(((analysis?.projectsScore || 0) / 60) * 100), 100),
    });
    badges.push({
      id: "link_master", name: "Link Master", icon: "🔗",
      description: "Include GitHub, LinkedIn, or portfolio links",
      earned: /\b(github|linkedin|portfolio)\b/i.test(text) && /https?:\/\//i.test(text),
      progress: (/\b(github|linkedin|portfolio)\b/i.test(text) ? 50 : 0) + (/https?:\/\//i.test(text) ? 50 : 0),
    });
    badges.push({
      id: "metric_driven", name: "Metric Driven", icon: "📊",
      description: "Include 3+ quantified achievements",
      earned: (text.match(/\d+%|\d+\+/g) || []).length >= 3,
      progress: Math.min(Math.round(((text.match(/\d+%|\d+\+/g) || []).length / 3) * 100), 100),
    });
    badges.push({
      id: "elite_resume", name: "Elite Resume", icon: "👑",
      description: "Score 85%+ overall ATS score",
      earned: atsScore >= 85, progress: Math.min(Math.round((atsScore / 85) * 100), 100),
    });

    const earned = badges.filter((b) => b.earned).length;
    return { badges, earned, total: badges.length };
  }

  // ─── Career Growth Suggestions ───
  static getCareerGrowth(text: string) {
    const lower = text.toLowerCase();
    const skills = AnalysisEngine.TECH_KEYWORDS.filter((k) => lower.includes(k));
    const yearsMatch = text.match(/(\d+)\+?\s*years?/i);
    const years = yearsMatch ? parseInt(yearsMatch[1]) : 1;

    const careerPaths: { current: string; next: string; skills: string[]; timeframe: string; match: RegExp }[] = [
      { current: "Junior Developer", next: "Mid-Level Developer", skills: ["Testing (Jest/Mocha)", "Git advanced workflows", "Code review practices", "Design patterns", "CI/CD basics"], timeframe: "6-12 months", match: /\b(junior|intern|trainee|entry.level|fresher)\b/i },
      { current: "Developer", next: "Senior Developer", skills: ["System design", "Mentoring", "Architecture patterns", "Performance optimization", "Security best practices", "Technical documentation"], timeframe: "1-2 years", match: /\b(developer|software engineer|programmer)\b/i },
      { current: "Senior Developer", next: "Tech Lead / Staff Engineer", skills: ["Team leadership", "Project estimation", "Stakeholder management", "System architecture", "Cross-team collaboration", "Technical roadmap planning"], timeframe: "2-3 years", match: /\b(senior|lead|principal|staff)\b/i },
      { current: "Data Analyst", next: "Senior Data Scientist", skills: ["Machine Learning", "Deep Learning", "MLOps", "A/B Testing", "Statistical Modeling", "Python advanced", "Cloud (AWS/GCP)"], timeframe: "1-2 years", match: /\b(data.analy|business.intelligence|reporting)\b/i },
      { current: "ML Engineer", next: "Senior ML Engineer", skills: ["MLOps", "Docker", "Kubernetes", "AWS SageMaker", "Model deployment", "A/B testing at scale", "Feature stores"], timeframe: "1-2 years", match: /\b(machine.learning|ml.engineer|deep.learning|ai.engineer)\b/i },
      { current: "Frontend Developer", next: "Senior Frontend Engineer", skills: ["Performance optimization", "Micro-frontends", "Design systems", "Accessibility (WCAG)", "State management at scale", "SSR/SSG"], timeframe: "1-2 years", match: /\b(frontend|front.end|react|angular|vue)\b/i },
      { current: "Backend Developer", next: "Senior Backend Engineer", skills: ["Distributed systems", "Message queues (Kafka/RabbitMQ)", "Caching strategies", "Database optimization", "API gateway", "Microservices"], timeframe: "1-2 years", match: /\b(backend|back.end|node|express|api)\b/i },
    ];

    const matched = careerPaths.filter((p) => p.match.test(text));
    const primary = matched[0] || careerPaths[1]; // default to developer path

    const missingSkills = primary.skills.filter((s) => !lower.includes(s.toLowerCase()));

    return {
      currentLevel: primary.current,
      nextRole: primary.next,
      yearsExperience: years,
      timeframe: primary.timeframe,
      skillsToLearn: missingSkills,
      allPaths: matched.slice(0, 3).map((p) => ({
        from: p.current,
        to: p.next,
        timeframe: p.timeframe,
        skillsNeeded: p.skills.filter((s) => !lower.includes(s.toLowerCase())),
      })),
    };
  }

  // ─── AI Project Suggestions ───
  static suggestProjects(text: string) {
    const lower = text.toLowerCase();
    const skills = AnalysisEngine.TECH_KEYWORDS.filter((k) => lower.includes(k));

    const projectBank: { title: string; description: string; techStack: string[]; difficulty: string; matchKeywords: string[] }[] = [
      { title: "AI Resume Analyzer", description: "Build a tool that parses resumes and provides ATS scoring using NLP", techStack: ["Python", "FastAPI", "React", "spaCy"], difficulty: "Advanced", matchKeywords: ["python", "machine learning", "nlp", "data analysis"] },
      { title: "Real-time Chat Application", description: "Build a full-stack chat app with WebSockets, auth, and message persistence", techStack: ["React", "Node.js", "Socket.io", "MongoDB"], difficulty: "Intermediate", matchKeywords: ["react", "node.js", "javascript", "mongodb"] },
      { title: "E-commerce Platform", description: "Build a complete online store with payments, cart, and admin dashboard", techStack: ["Next.js", "Stripe", "PostgreSQL", "Tailwind"], difficulty: "Advanced", matchKeywords: ["react", "next.js", "javascript", "typescript", "sql"] },
      { title: "ML Recommendation System", description: "Build a movie/product recommendation engine using collaborative filtering", techStack: ["Python", "Scikit-Learn", "Pandas", "Flask"], difficulty: "Intermediate", matchKeywords: ["python", "machine learning", "pandas", "scikit-learn"] },
      { title: "NLP Sentiment Analyzer", description: "Build a sentiment analysis tool for social media posts or reviews", techStack: ["Python", "NLTK/spaCy", "Transformers", "Streamlit"], difficulty: "Intermediate", matchKeywords: ["python", "nlp", "machine learning", "deep learning"] },
      { title: "DevOps CI/CD Pipeline", description: "Set up automated testing, building, and deployment pipeline", techStack: ["Docker", "GitHub Actions", "AWS", "Terraform"], difficulty: "Intermediate", matchKeywords: ["docker", "kubernetes", "aws", "ci/cd", "terraform"] },
      { title: "Microservices Architecture", description: "Design and deploy a microservices-based application", techStack: ["Node.js", "Docker", "Kubernetes", "Redis"], difficulty: "Advanced", matchKeywords: ["docker", "kubernetes", "microservices", "node.js"] },
      { title: "Portfolio Website with CMS", description: "Build a personal portfolio with a headless CMS and blog", techStack: ["Next.js", "MDX", "Tailwind", "Vercel"], difficulty: "Beginner", matchKeywords: ["react", "next.js", "html", "css", "javascript"] },
      { title: "Data Pipeline & Dashboard", description: "Build an ETL pipeline with interactive visualization dashboard", techStack: ["Python", "Apache Airflow", "PostgreSQL", "Tableau"], difficulty: "Advanced", matchKeywords: ["python", "sql", "data analysis", "postgresql"] },
      { title: "Computer Vision Object Detector", description: "Build a real-time object detection system using YOLO or similar", techStack: ["Python", "PyTorch", "OpenCV", "FastAPI"], difficulty: "Advanced", matchKeywords: ["python", "deep learning", "pytorch", "computer vision", "tensorflow"] },
      { title: "REST API with Auth & RBAC", description: "Build a production-ready API with JWT auth, roles, and rate limiting", techStack: ["Node.js", "Express", "PostgreSQL", "Redis"], difficulty: "Intermediate", matchKeywords: ["node.js", "express", "rest api", "sql", "postgresql"] },
      { title: "Mobile Expense Tracker", description: "Build a cross-platform mobile app for tracking expenses", techStack: ["React Native", "Firebase", "TypeScript"], difficulty: "Intermediate", matchKeywords: ["react", "javascript", "typescript", "mongodb", "firebase"] },
    ];

    // Score each project based on skill overlap
    const scored = projectBank.map((p) => {
      const overlap = p.matchKeywords.filter((k) => skills.includes(k)).length;
      return { ...p, relevance: Math.round((overlap / p.matchKeywords.length) * 100) };
    });

    scored.sort((a, b) => b.relevance - a.relevance);
    return { projects: scored.filter((p) => p.relevance > 0).slice(0, 5) };
  }

  // ─── Mock Interview Answer Evaluator ───
  static evaluateAnswer(question: string, answer: string, resumeKeywords: string[]): {
    score: number;
    scoreOutOf10: number;
    grade: string;
    strengths: string[];
    feedback: string[];
    techMentioned: string[];
    starFeedback: string;
  } {
    const lower = answer.toLowerCase();
    const words = answer.split(/\s+/).length;

    let score = 50;
    const feedback: string[] = [];
    const strengths: string[] = [];

    // Length check
    if (words < 20) { score -= 15; feedback.push("Your answer is too short — aim for 50-150 words with a structured response"); }
    else if (words >= 50 && words <= 200) { score += 10; strengths.push("Good answer length"); }
    else if (words > 200) { score -= 5; feedback.push("Try to be more concise — keep answers focused and under 200 words"); }

    // STAR method detection
    const hasSituation = /\b(when|situation|context|at my|at the|during)\b/i.test(answer);
    const hasAction = /\b(i (developed|built|created|led|managed|implemented|designed|optimized)|my approach|i decided|i chose)\b/i.test(answer);
    const hasResult = /\b(result|improved|increased|reduced|achieved|delivered|led to|which|outcome)\b/i.test(answer);

    if (hasSituation && hasAction && hasResult) { score += 15; strengths.push("Great STAR method structure (Situation → Action → Result)"); }
    else {
      if (!hasSituation) feedback.push("Add context — describe the situation or challenge");
      if (!hasAction) feedback.push("Describe your specific actions — what did YOU do?");
      if (!hasResult) feedback.push("Include results — quantify the outcome of your work");
    }

    // Metrics/numbers
    if (/\d+%|\d+\s*(users|projects|team|people|hours|days)|\$\d/i.test(answer)) { score += 10; strengths.push("Good use of quantifiable metrics"); }
    else feedback.push("Add specific numbers (e.g., '40% improvement', 'team of 5')");

    // Technical depth
    const techMentioned = resumeKeywords.filter((k) => lower.includes(k.toLowerCase()));
    if (techMentioned.length >= 2) { score += 10; strengths.push(`Mentioned relevant tech: ${techMentioned.join(", ")}`); }
    else if (techMentioned.length === 0) feedback.push("Mention specific technologies you used");

    // Confidence indicators
    if (/\b(i believe|i think|maybe|probably|i guess)\b/i.test(answer)) { score -= 5; feedback.push("Avoid uncertain language — be confident and direct"); }

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Average" : "Needs Improvement";
    const scoreOutOf10 = Math.max(1, Math.min(10, Math.round(score / 10)));
    const starParts: string[] = [];
    if (hasSituation && hasAction && hasResult) {
      starParts.push("Your answer maps reasonably well to Situation, Action, and Result.");
    } else {
      if (!hasSituation) starParts.push("Strengthen the Situation: briefly set context (team, timeline, constraint).");
      if (!hasAction) starParts.push("Clarify the Action: what you personally did, with verbs and scope.");
      if (!hasResult) starParts.push("Add the Result: quantify impact (%, time, revenue, users) where possible.");
    }
    starParts.push("Use STAR end-to-end: one clear example per question, then tie the Result back to what the interviewer cares about.");
    const starFeedback = starParts.join(" ");

    return { score, scoreOutOf10, grade, strengths, feedback, techMentioned, starFeedback };
  }

  // ─── AI Chat: Answer resume questions ───
  static chatAnswer(question: string, resumeText: string, analysisData: { atsScore: number; keywords: string[]; missingKeywords: string[]; suggestions: string[]; skillsScore: number; experienceScore: number; educationScore: number; projectsScore: number } | null) {
    const lower = question.toLowerCase();

    if (/\b(ats|score|overall|how.*(my|the).*resume)\b/i.test(lower)) {
      const score = analysisData?.atsScore || 0;
      return { answer: `Your ATS compatibility score is **${score}%**. ${score >= 80 ? "Excellent! Your resume is well-optimized." : score >= 60 ? "Good, but there's room for improvement." : "This needs work — focus on adding relevant keywords and structuring sections properly."}\n\n**Quick tips:**\n${analysisData?.suggestions?.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n") || "Run the analysis first to get personalized suggestions."}` };
    }

    if (/\b(experience|work|job)\b.*\b(improve|better|strengthen|weak)\b/i.test(lower) || /improve.*experience/i.test(lower)) {
      const score = analysisData?.experienceScore || 0;
      return { answer: `Your Experience section scores **${score}/100**.\n\n**To improve it:**\n1. Start every bullet with a strong action verb (Developed, Led, Optimized)\n2. Add quantified achievements: "Reduced API response time by 40%"\n3. Include company names, job titles, and date ranges\n4. Use the XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]"\n\n**Example upgrade:**\n❌ Responsible for managing projects\n✅ Led 3 cross-functional projects, delivering 2 weeks ahead of schedule and saving $15K in resources` };
    }

    if (/\b(skill|tech|keyword)\b.*\b(add|miss|improve|lack)\b/i.test(lower) || /missing.*skill/i.test(lower)) {
      const missing = analysisData?.missingKeywords || [];
      return { answer: `**Missing keywords from your resume:**\n${missing.length > 0 ? missing.map((k) => `• ${k}`).join("\n") : "None detected — great coverage!"}\n\n**Your current keywords:** ${analysisData?.keywords?.join(", ") || "Run analysis first"}\n\n**Tip:** Add these keywords naturally in your Skills section and within experience bullet points for better ATS matching.` };
    }

    if (/\b(project|portfolio)\b.*\b(improve|add|weak|better)\b/i.test(lower)) {
      const score = analysisData?.projectsScore || 0;
      return { answer: `Your Projects section scores **${score}/100**.\n\n**To strengthen it:**\n1. Add 2-3 significant projects with clear descriptions\n2. Include the tech stack for each project\n3. Add GitHub links and live demo URLs\n4. Describe YOUR specific role and contributions\n5. Include measurable outcomes\n\n**Example:**\n🚀 **AI Resume Analyzer** — Built a full-stack app using React, Node.js, and MongoDB that analyzes resumes with 95% keyword accuracy. GitHub: [link] | Live: [link]` };
    }

    if (/\b(education|degree|university)\b/i.test(lower)) {
      const score = analysisData?.educationScore || 0;
      return { answer: `Your Education section scores **${score}/100**.\n\n**Tips:**\n1. Include your degree type (B.S., M.S., etc.)\n2. Add university name and graduation year\n3. Include GPA if above 3.0\n4. List relevant coursework\n5. Add certifications and honors` };
    }

    if (/\b(summary|objective|profile)\b/i.test(lower)) {
      return { answer: `**Professional Summary Tips:**\n\nA great summary is 2-3 sentences that include:\n1. Your job title and years of experience\n2. Your top 3 technical skills\n3. A key achievement or value proposition\n\n**Example:**\n"Results-driven Software Engineer with 3+ years of experience in React, Node.js, and AWS. Developed scalable applications serving 50K+ users. Passionate about clean code and performance optimization."` };
    }

    if (/\b(format|layout|design|ats.friendly)\b/i.test(lower)) {
      return { answer: `**ATS-Friendly Resume Format:**\n\n1. Use standard section headings: Summary, Experience, Skills, Education, Projects\n2. Use a single-column layout\n3. Avoid tables, images, or fancy formatting\n4. Use standard fonts (Arial, Calibri, Inter)\n5. Save as PDF (not DOCX for submission)\n6. Keep to 1-2 pages\n7. Use consistent date formatting\n8. Include contact info at the top (email, phone, LinkedIn, GitHub)` };
    }

    // Default response
    return { answer: `Great question! Here's what I can help with — try asking:\n\n• "How can I improve my experience section?"\n• "What skills am I missing?"\n• "How's my ATS score?"\n• "How to improve my projects section?"\n• "What should my summary look like?"\n• "How to make my resume ATS-friendly?"\n• "How to improve my education section?"\n\nI'll give you personalized advice based on your resume analysis! 🚀` };
  }

  // ─── AI Cover Letter / LinkedIn / Bio Generator ───
  static generateContent(
    resumeText: string,
    jobDescription: string,
    type: "cover_letter" | "linkedin_summary" | "professional_bio",
    accountName?: string
  ) {
    const lower = resumeText.toLowerCase();

    // Extract the candidate's REAL HUMAN NAME (not university/company names)
    // Strategy: check each line starting from the top; skip lines containing org keywords
    const ORG_NOISE = /\b(university|college|institute|school|academy|corporation|inc\b|ltd\b|llc\b|company|department|faculty|center|centre|foundation|technologies|solutions)\b/i;
    const nameLines = resumeText.split("\n").slice(0, 8); // only check first 8 lines
    const trimmedAccount = accountName?.trim();
    let name = "the candidate";
    if (trimmedAccount && trimmedAccount.length >= 2 && trimmedAccount.length <= 120) {
      name = trimmedAccount;
    } else {
      for (const line of nameLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length > 60) continue; // skip empty or very long lines
        if (ORG_NOISE.test(trimmed)) continue;           // skip org/university names
        if (/\b(cv|resume|curriculum vitae)\b/i.test(trimmed)) continue; // skip document titles, not people
        if (/[@.\/:]/.test(trimmed)) continue;            // skip emails, URLs, phone lines
        if (/^\d/.test(trimmed)) continue;                // skip lines starting with numbers
        const personMatch = trimmed.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/);
        if (personMatch) {
          name = personMatch[1];
          break;
        }
      }
    }

    const skills = AnalysisEngine.TECH_KEYWORDS.filter((k) => lower.includes(k));
    const topSkills = skills.slice(0, 5);
    const softSkills = AnalysisEngine.SOFT_SKILLS.filter((k) => lower.includes(k));

    const yearsMatch = resumeText.match(/(\d+)\+?\s*years?/i);
    const years = yearsMatch ? yearsMatch[1] : "several";

    const degreeMatch = resumeText.match(/\b(Bachelor|Master|PhD|B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|MBA)\b[^.\n]*/i);
    const degree = degreeMatch ? degreeMatch[0].trim() : "";

    // Extract role from JD
    const roleMatch = jobDescription.match(/(?:role|position|title|hiring for)[:\s]+([^\n.,]+)/i)
      || jobDescription.match(/^([^\n]{10,60})/);
    const role = roleMatch ? roleMatch[1].trim() : "this position";

    const companyMatch = jobDescription.match(/(?:at|company|join)\s+([A-Z][A-Za-z\s&]+?)(?:\.|,|\s+as|\s+is|\s+to|\s+and)/);
    const company = companyMatch ? companyMatch[1].trim() : "your company";

    // JD keywords
    const jdKeywords = AnalysisEngine.TECH_KEYWORDS.filter((k) =>
      jobDescription.toLowerCase().includes(k)
    );
    const matchedSkills = topSkills.filter((s) =>
      jdKeywords.some((j) => j.toLowerCase() === s.toLowerCase())
    );

    if (type === "cover_letter") {
      const paragraphs = [
        `Dear Hiring Manager,`,
        ``,
        `I am writing to express my strong interest in the ${role} position at ${company}. With ${years} years of experience in ${topSkills.slice(0, 3).join(", ")}${degree ? `, and a ${degree}` : ""}, I am confident in my ability to make a meaningful contribution to your team.`,
        ``,
        `Throughout my career, I have developed expertise in ${topSkills.join(", ")}${softSkills.length > 0 ? `, complemented by strong ${softSkills.slice(0, 2).join(" and ")} skills` : ""}. ${matchedSkills.length > 0 ? `I noticed your job description emphasizes ${matchedSkills.join(", ")} — areas where I have demonstrated proven results.` : "My diverse skill set aligns well with the requirements outlined in the job description."}`,
        ``,
        `In my previous roles, I have consistently delivered high-quality results. I am particularly drawn to ${company} because of the opportunity to work on challenging problems and contribute to innovative solutions. I am excited about the possibility of bringing my ${topSkills[0] || "technical"} expertise and ${softSkills[0] || "collaborative"} approach to your team.`,
        ``,
        `I would welcome the opportunity to discuss how my background, skills, and experience can contribute to the continued success of ${company}. Thank you for considering my application.`,
        ``,
        `Sincerely,`,
        name,
      ];
      return { type: "Cover Letter", content: paragraphs.join("\n") };
    }

    if (type === "linkedin_summary") {
      const content = `${topSkills[0] ? topSkills[0].charAt(0).toUpperCase() + topSkills[0].slice(1) : "Technology"} professional with ${years}+ years of experience building impactful solutions. Skilled in ${topSkills.slice(0, 4).join(", ")}${softSkills.length > 0 ? ` with a strong focus on ${softSkills[0]}` : ""}.\n\n${degree ? `📚 ${degree}\n` : ""}💻 Core Skills: ${skills.slice(0, 8).join(" • ")}\n\n🚀 Passionate about leveraging technology to solve real-world problems. Always learning, always building.\n\n📩 Open to opportunities in ${topSkills.slice(0, 2).join(", ")} roles. Let's connect!`;
      return { type: "LinkedIn Summary", content };
    }

    // professional_bio
    const content = `${name} is a ${topSkills[0] || "technology"} professional with ${years} years of experience specializing in ${topSkills.slice(0, 3).join(", ")}. ${degree ? `Holding a ${degree}, ` : ""}${name.split(" ")[0]} brings expertise in ${skills.slice(0, 5).join(", ")} to deliver scalable, production-ready solutions.${softSkills.length > 0 ? ` Known for ${softSkills.slice(0, 2).join(" and ")}, ${name.split(" ")[0]} thrives in collaborative environments.` : ""}`;
    return { type: "Professional Bio", content };
  }

  // ─── Resume Comparison ───
  static compareResumes(oldText: string, newText: string) {
    const analyzeQuick = (text: string) => {
      const lower = text.toLowerCase();
      const techCount = AnalysisEngine.TECH_KEYWORDS.filter((k) => lower.includes(k)).length;
      const softCount = AnalysisEngine.SOFT_SKILLS.filter((k) => lower.includes(k)).length;
      const verbCount = AnalysisEngine.ACTION_VERBS.filter((v) => lower.includes(v)).length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const hasMetrics = (text.match(/\d+%|\d+\+/g) || []).length;
      const hasSummary = /\b(summary|objective|profile)\b/i.test(text);
      const hasEducation = /\b(education|degree|university)\b/i.test(text);
      const hasExperience = /\b(experience|employment)\b/i.test(text);
      const hasProjects = /\b(projects|portfolio)\b/i.test(text);
      const hasSkills = /\b(skills|technologies)\b/i.test(text);
      const sectionCount = [hasSummary, hasEducation, hasExperience, hasProjects, hasSkills].filter(Boolean).length;

      const score = Math.min(
        Math.round(
          Math.min(techCount / 8, 1) * 25 +
          Math.min(verbCount / 6, 1) * 20 +
          Math.min(wordCount / 300, 1) * 15 +
          Math.min(hasMetrics / 3, 1) * 15 +
          Math.min(sectionCount / 4, 1) * 15 +
          Math.min(softCount / 3, 1) * 10
        ),
        100
      );

      return {
        score,
        techKeywords: techCount,
        actionVerbs: verbCount,
        softSkills: softCount,
        wordCount,
        metricsUsed: hasMetrics,
        sections: sectionCount,
      };
    };

    const oldAnalysis = analyzeQuick(oldText);
    const newAnalysis = analyzeQuick(newText);
    const improvement = newAnalysis.score - oldAnalysis.score;

    const comparisons = [
      { label: "ATS Score", old: oldAnalysis.score, new: newAnalysis.score, unit: "%" },
      { label: "Technical Keywords", old: oldAnalysis.techKeywords, new: newAnalysis.techKeywords, unit: "" },
      { label: "Action Verbs", old: oldAnalysis.actionVerbs, new: newAnalysis.actionVerbs, unit: "" },
      { label: "Soft Skills", old: oldAnalysis.softSkills, new: newAnalysis.softSkills, unit: "" },
      { label: "Word Count", old: oldAnalysis.wordCount, new: newAnalysis.wordCount, unit: "" },
      { label: "Quantified Metrics", old: oldAnalysis.metricsUsed, new: newAnalysis.metricsUsed, unit: "" },
      { label: "Sections Found", old: oldAnalysis.sections, new: newAnalysis.sections, unit: "/5" },
    ];

    return {
      oldScore: oldAnalysis.score,
      newScore: newAnalysis.score,
      improvement,
      verdict: improvement > 15 ? "Major Improvement! 🎉" : improvement > 5 ? "Good Progress! 👍" : improvement > 0 ? "Slight Improvement" : improvement === 0 ? "No Change" : "Score Decreased ⚠️",
      comparisons,
    };
  }
}

// ── Service ──────────────────────────────────────────────────────
export class AnalysisService {
  /**
   * Read text from the uploaded file, preferring `storedResumeText` when the file is missing
   * or yields less text (typical on Vercel: `/tmp` is not shared across serverless invocations).
   */
  private async _extractResumeTextPreferringStored(resume: {
    fileUrl: string;
    fileName: string;
    storedResumeText: string | null;
  }): Promise<string> {
    let resumeText = await extractTextFromFile(resume.fileUrl);
    const storedRaw = (resume.storedResumeText ?? "").trim();
    const storedUsable = storedRaw.length > 0 && !looksLikeExtractionPlaceholder(storedRaw);
    const fileW = countWords(resumeText);
    const storedW = storedUsable ? countWords(storedRaw) : 0;
    if (storedUsable && storedW > fileW) {
      console.log(
        `[Parser] Preferring storedResumeText (${storedW} words) over file extraction (${fileW} words) for "${resume.fileName}"`,
      );
      resumeText = storedRaw;
    }
    return resumeText;
  }

  async analyzeResume(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
      include: { analysis: true },
    });

    if (!resume) throw new Error("Resume not found");

    let resumeText = await this._extractResumeTextPreferringStored(resume);

    if (!resumeText.trim()) {
      throw new ClientError(
        "Could not extract text from this resume. It may be scanned, image-only, or password-protected; " +
          "export a text-based PDF or DOCX from Word or Google Docs and upload again. " +
          "If you already uploaded a normal PDF, try uploading once more so the server can cache the extracted text.",
        422,
        "PARSING_FAILED",
      );
    }

    if (looksLikeExtractionPlaceholder(resumeText)) {
      throw new ClientError(
        "Stored resume text looks like a failed parse from an earlier run. Re-upload a text-based PDF and analyze again.",
        422,
        "PARSING_FAILED",
      );
    }

    const extractedWords = countWords(resumeText);
    if (extractedWords < MIN_WORDS_FOR_SCORING) {
      throw new ClientError(
        `Only ${extractedWords} word(s) could be extracted — at least ${MIN_WORDS_FOR_SCORING} are required for a reliable score. ` +
          "Try a text-based PDF (not a photo scan), or ensure the file is not corrupted.",
        422,
        "INSUFFICIENT_TEXT",
      );
    }

    console.log(`[Analysis] Extracted ${extractedWords} words from ${resume.fileName}`);
    console.log("[Analysis] Extracted Text Length:", resumeText.length);

    let atsScore: number;
    let skillsScore: number;
    let experienceScore: number;
    let educationScore: number;
    let projectsScore: number;
    let keywords: string[];
    let missingKeywords: string[];
    let suggestions: string[];

    // ── Try LLM first ──
    if (isLlmAvailable()) {
      console.log("[Analysis] Using Gemini AI...");
      console.log(`[Analysis] Resume text being sent to Gemini (${resumeText.split(/\s+/).filter(Boolean).length} words):`);
      console.log(`[Analysis] First 500 chars: ${resumeText.slice(0, 500)}`);
      let llmResult;
      try {
        llmResult = await llmAnalyzeResume(resumeText);
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        console.error("[Analysis] LLM threw unexpectedly:", err instanceof Error ? err.message : String(err));
        throw new ClientError(
          "AI Analysis failed, please try again.",
          503,
          "AI_ANALYSIS_FAILED",
        );
      }
      if (!llmResult) {
        console.error("[Analysis] LLM returned no usable result (invalid JSON or empty after retries)");
        throw new ClientError(
          "AI Analysis failed, please try again.",
          503,
          "AI_ANALYSIS_FAILED",
        );
      }
      atsScore = llmResult.ats_score;
      skillsScore = llmResult.skills_score;
      experienceScore = llmResult.experience_score;
      educationScore = llmResult.education_score;
      projectsScore = llmResult.projects_score;
      keywords = llmResult.matched_keywords;
      missingKeywords = llmResult.missing_keywords;
      suggestions = llmResult.suggestions;
      // Store dimensional metrics for this request
      (this as unknown as { _lastMetrics?: object })._lastMetrics = {
        grammarScore: llmResult.grammar_score ?? 70,
        impactScore: llmResult.impact_score ?? 60,
        formattingScore: llmResult.formatting_score ?? 70,
        keywordScore: llmResult.keyword_score ?? 65,
      };
      console.log(`[Analysis] ✅ LLM analysis complete — ATS: ${atsScore}%`);

      // ── Sanity check: catch degenerate LLM output (e.g., ats=1, all sections=0)
      // and fall through to rule-based engine, which uses real text patterns.
      if (isDegenerateAnalysis(atsScore, skillsScore, experienceScore, educationScore, projectsScore)) {
        console.warn(
          `[Analysis] ⚠️ LLM returned degenerate scores (ats=${atsScore}, ` +
          `skills=${skillsScore}, exp=${experienceScore}, edu=${educationScore}, ` +
          `proj=${projectsScore}) — falling back to rule-based engine`,
        );
        const fb = this._ruleBasedAnalysis(resumeText, resume.fileName);
        ({ atsScore, skillsScore, experienceScore, educationScore, projectsScore, keywords, missingKeywords, suggestions } = fb);
      }
    } else {
      // No API key — use rule-based engine
      const fb = this._ruleBasedAnalysis(resumeText, resume.fileName);
      ({ atsScore, skillsScore, experienceScore, educationScore, projectsScore, keywords, missingKeywords, suggestions } = fb);
    }

    // ── Final safety net ──
    // If even the rule-based engine produced nothing useful (e.g., text extraction
    // gave us a stub like "could not be parsed"), preserve previous good data if
    // any, otherwise apply the minimum-score fallback with a guidance message.
    if (isDegenerateAnalysis(atsScore, skillsScore, experienceScore, educationScore, projectsScore)) {
      const prev = resume.analysis;
      if (prev && prev.skillsScore > 0) {
        const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
        if (wordCount >= 20) {
          await prisma.resume.update({
            where: { id: resumeId },
            data: { storedResumeText: resumeText.slice(0, 500_000) },
          });
        }
        console.log("[Analysis] Preserving previous analysis data (current extraction failed)");
        return prev;
      }

      console.warn("[Analysis] All analyzers returned degenerate output — applying guidance fallback");
      atsScore = 15;
      skillsScore = 10;
      experienceScore = 10;
      educationScore = 10;
      projectsScore = 5;
      keywords = ["(unable to extract — upload text-based PDF)"];
      missingKeywords = ["(upload a text-based PDF for keyword analysis)"];
      suggestions = [
        "⚠️ Your resume is image-based or scanned — text could not be extracted for analysis.",
        "For accurate results: Open your resume in Word/Google Docs → File → Export/Save as PDF. This creates a text-based PDF.",
        "Include a Skills section listing technologies: Python, React, AWS, Docker, etc.",
        "Add quantified achievements: 'Reduced load time by 40%' not 'Improved performance'",
        "Ensure clear section headings: Summary, Experience, Skills, Education, Projects",
      ];
    }

    // Enrich keywords with NLP-detected soft skills (Soft:Label) for visualizations / preview fallbacks
    const nlpSoft = AnalysisEngine.findSoftSkillsInText(resumeText);
    for (const s of nlpSoft) {
      const tagged = `Soft:${s}`;
      if (!keywords.some((k) => k.toLowerCase() === tagged.toLowerCase())) {
        keywords.push(tagged);
      }
    }

    // Persist extracted/normalized text for preview & visualizations when the file
    // is no longer on disk (Vercel /tmp). Capped to stay within Mongo document limits.
    const MAX_STORED_TEXT = 500_000;
    const textToStore = resumeText.slice(0, MAX_STORED_TEXT);
    await prisma.resume.update({ where: { id: resumeId }, data: { atsScore, storedResumeText: textToStore } });

    // Upsert analysis
    const analysis = await prisma.analysis.upsert({
      where: { resumeId },
      update: { skillsScore, experienceScore, educationScore, projectsScore, suggestions, keywords, missingKeywords },
      create: { resumeId, skillsScore, experienceScore, educationScore, projectsScore, suggestions, keywords, missingKeywords },
    });

    // Attach dimensional metrics (not stored in DB, computed per-request)
    const metrics = (this as unknown as { _lastMetrics?: object })._lastMetrics || {
      grammarScore: Math.min(Math.round(atsScore * 1.05), 100),
      impactScore: Math.round(experienceScore * 0.9),
      formattingScore: Math.round((skillsScore + educationScore) / 2),
      keywordScore: Math.round(skillsScore * 0.95),
    };

    return { ...analysis, metrics };
  }

  /** Rule-based fallback (NLP + pattern matching) */
  private _ruleBasedAnalysis(resumeText: string, fileName: string) {
    const nlpResult = runNlpAnalysis(resumeText, AnalysisEngine.TECH_KEYWORDS);
    const result = AnalysisEngine.analyzeResume(resumeText, fileName);

    // Only add NLP keywords that are ACTUAL known tech keywords (strict match)
    const validNlpKeywords = nlpResult.tfidfKeywords.filter((k) =>
      AnalysisEngine.TECH_KEYWORDS.some((tk) => tk.toLowerCase() === k.toLowerCase())
    );

    const validDynamicSkills = nlpResult.dynamicSkills.filter((s) =>
      s.length >= 3 && /^[A-Z]/.test(s) // must start with uppercase (proper noun = technology name)
    );

    const keywords = Array.from(new Set([
      ...result.keywords,
      ...validDynamicSkills.slice(0, 3),
      ...validNlpKeywords.slice(0, 3),
    ])).slice(0, 20);

    return { ...result, keywords };
  }

  async matchJob(resumeId: string, jobDescription: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");

    const resumeText = await this._extractResumeTextPreferringStored(resume);

    // ── Pre-check: Does the JD actually contain technical skills? ──
    const jdLower = jobDescription.toLowerCase();
    const jdHasTechSkills = AnalysisEngine.TECH_KEYWORDS.some((kw) =>
      AnalysisEngine.matchKeyword(jdLower, kw)
    ) || AnalysisEngine.SOFT_SKILLS.some((kw) =>
      AnalysisEngine.matchKeyword(jdLower, kw)
    );

    if (!jdHasTechSkills) {
      console.log("[JobMatch] JD has no technical skills — returning honest empty result");
      return {
        overallScore: 30,
        skillMatch: 0,
        experienceMatch: 50,
        educationMatch: 50,
        keywordsFound: [] as string[],
        missingKeywords: [] as string[],
        suggestions: [
          "The job description doesn't contain recognizable technical skill requirements.",
          "For accurate skill gap analysis, paste a JD that lists specific technologies, tools, or frameworks.",
          "Try a JD with requirements like: 'Proficient in Python, AWS, Docker, React'",
        ],
      };
    }

    let result;

    // ── Try LLM (only if JD has real technical content) ──
    if (isLlmAvailable()) {
      console.log("[JobMatch] Using Gemini AI...");
      const llmResult = await llmJobMatch(resumeText, jobDescription);
      if (llmResult) {
        // Validate LLM didn't hallucinate skills not in the JD
        const validMatched = llmResult.matched_skills.filter((s) =>
          AnalysisEngine.matchKeyword(jdLower, s) || AnalysisEngine.matchKeyword(resumeText.toLowerCase(), s)
        );
        const validMissing = llmResult.missing_skills.filter((s) =>
          AnalysisEngine.matchKeyword(jdLower, s)
        );

        result = {
          overallScore: llmResult.overall_score,
          skillMatch: llmResult.skill_match,
          experienceMatch: llmResult.experience_match,
          educationMatch: llmResult.education_match,
          keywordsFound: validMatched,
          missingKeywords: validMissing,
          suggestions: llmResult.suggestions,
        };
        console.log(`[JobMatch] ✅ LLM match — Score: ${result.overallScore}%, Matched: ${validMatched.length}, Missing: ${validMissing.length}`);
      }
    }

    if (!result) {
      const resumeKeywords = resume.analysis?.keywords || [];
      result = AnalysisEngine.matchJob(resumeKeywords, resumeText, jobDescription);
    }

    if (resume.analysis) {
      await prisma.analysis.update({ where: { id: resume.analysis.id }, data: { jobMatchScore: result.overallScore } });
    }

    return result;
  }

  async generateInterviewQuestions(resumeId: string, userId: string) {
    const [resume, userRow] = await Promise.all([
      prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    if (!resume) throw new Error("Resume not found");

    const accountName = userRow?.name?.trim() || undefined;

    let resumeText = await this._extractResumeTextPreferringStored(resume);

    // If extraction failed but we have stored analysis, build context from it
    const storedKeywords = resume.analysis?.keywords || [];
    if ((!resumeText.trim() || resumeText.split(/\s+/).length < 20) && storedKeywords.length > 0) {
      console.log("[Interview] Using stored analysis keywords as context");
      const who = accountName || resume.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      resumeText = `Candidate: ${who}. Resume file: ${resume.fileName}. Skills: ${storedKeywords.join(", ")}.`;
    }

    // ── Try LLM first ──
    if (isLlmAvailable() && resumeText.split(/\s+/).length > 10) {
      console.log("[Interview] Using Gemini AI...");
      const llmResult = await llmInterviewQuestions(resumeText, accountName);
      if (llmResult && llmResult.questions.length > 0) {
        console.log(`[Interview] ✅ LLM generated ${llmResult.questions.length} questions`);
        return { totalQuestions: llmResult.questions.length, questions: llmResult.questions };
      }
    }

    // Use stored keywords for rule-based generation (not just extracted text)
    const keywords = storedKeywords.length > 0 ? storedKeywords : resume.analysis?.keywords || [];
    return AnalysisEngine.generateInterviewQuestions(resumeText, keywords);
  }

  async generateSmartFeedback(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");

    const resumeText = await this._getResumeTextWithFallback(resume);

    // ── Try LLM first ──
    if (isLlmAvailable()) {
      console.log("[Feedback] Using Gemini AI...");
      const llmResult = await llmSmartFeedback(resumeText);
      if (llmResult) {
        console.log(`[Feedback] ✅ LLM found ${llmResult.feedback.length} items`);
        return {
          score: llmResult.score,
          totalLinesScanned: resumeText.split("\n").length,
          issuesFound: llmResult.feedback.length,
          summary: {
            high: llmResult.feedback.filter((f) => f.severity === "high").length,
            medium: llmResult.feedback.filter((f) => f.severity === "medium").length,
            low: llmResult.feedback.filter((f) => f.severity === "low").length,
          },
          feedback: llmResult.feedback,
        };
      }
    }

    return AnalysisEngine.generateSmartFeedback(resumeText);
  }

  async rewriteBulletPoint(text: string) {
    // Try LLM for high-quality AI rewrite
    if (isLlmAvailable()) {
      const { llmRewriteBullet } = await import("./llm.service");
      const result = await llmRewriteBullet(text);
      if (result) return result;
    }
    // Fallback to rule-based engine
    return AnalysisEngine.rewriteBulletPoint(text);
  }

  async analyzeSections(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");

    const resumeText = await this._getResumeTextWithFallback(resume);

    // Run the rule-based section analyzer to get tips, issues, and found/not-found status
    const freshResult = AnalysisEngine.analyzeSections(resumeText);

    // ── SINGLE SOURCE OF TRUTH: If we have stored master analysis, use THOSE scores ──
    // The stored analysis (from LLM or main analyzeResume) is authoritative.
    // We keep the fresh tips/issues for UX value, but REPLACE all scores.
    if (resume.analysis) {
      const a = resume.analysis;

      // Map master scores to section names (direct assignment — NO Math.max inflation)
      const scoreMap: Record<string, number> = {
        "Summary": a.skillsScore, // Summary uses skills score as proxy
        "Experience": a.experienceScore,
        "Skills": a.skillsScore,
        "Projects": a.projectsScore,
        "Education": a.educationScore,
      };

      for (const section of freshResult.sections) {
        if (scoreMap[section.name] !== undefined) {
          section.score = scoreMap[section.name];
          section.grade = section.score >= 90 ? "A+" : section.score >= 80 ? "A" : section.score >= 70 ? "B" : section.score >= 60 ? "C" : section.score >= 40 ? "D" : "F";
          // If master score is decent but section text wasn't detected, adjust messaging
          if (section.score > 20 && !section.found) {
            section.found = true;
            section.issues = section.issues.filter(i => !i.includes("not found"));
          }
        }
      }

      // Overall = stored ATS score (the one displayed at the top of the dashboard)
      // This guarantees the Section Analyzer's "Overall" matches the main ATS Score card.
      freshResult.overall = resume.atsScore ?? Math.round(
        freshResult.sections.reduce((acc, s) => acc + s.score, 0) / freshResult.sections.length
      );

      return freshResult;
    }

    // No stored analysis yet — return fresh rule-based scores as-is
    return freshResult;
  }

  async getResumeText(resumeId: string, userId: string): Promise<string> {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new Error("Resume not found");
    return this._extractResumeTextPreferringStored(resume);
  }

  async getResumePreview(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");

    const wordCountOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    const MAX_TEXT = 500_000;
    const stored = (resume.storedResumeText ?? "").trim();

    // Prefer readable file text when strong; otherwise use DB text from last analysis
    // (fixes Vercel /tmp loss so highlights + soft skills still work without the PDF).
    let fileText = "";
    try {
      fileText = (await this._extractResumeTextPreferringStored(resume)).trim();
    } catch (err) {
      console.warn("[Preview] File extraction failed:", err);
    }

    let text = "";
    let usedStoredResumeText = false;
    if (wordCountOf(fileText) >= 20 && !looksLikeExtractionPlaceholder(fileText)) {
      text = fileText.slice(0, MAX_TEXT);
    } else if (wordCountOf(stored) >= 20 && !looksLikeExtractionPlaceholder(stored)) {
      text = stored.slice(0, MAX_TEXT);
      usedStoredResumeText = true;
      console.log(`[Preview] Using stored resume text from DB for ${resume.fileName} (${wordCountOf(text)} words)`);
    } else {
      text = (fileText || stored).slice(0, MAX_TEXT);
      usedStoredResumeText = wordCountOf(stored) > wordCountOf(fileText) && stored.length > 0;
    }

    const extractedWordCount = wordCountOf(text);

    if (looksLikeExtractionPlaceholder(text)) {
      console.log(`[Preview] Extraction placeholder detected for ${resume.fileName} — parsing error UI`);
      return {
        fullText: "",
        wordCount: 0,
        sections: [
          {
            name: "Parsing error",
            content:
              "This resume could not be parsed for usable text. It may be a scanned or image-only PDF, or the file is protected. " +
              "Export a text-based PDF from Word or Google Docs. " +
              "If you only have a scan, OCR (e.g. Tesseract.js or a cloud Document AI) could be added later to read image-based pages.",
            color: "#ef4444",
          },
        ],
        highlights: { techKeywords: [], softSkills: [], actionVerbs: [], dynamicSkills: [] },
        topSkills: [],
        industryClassification: { industries: [], primary: "General" },
        fileAvailable: true,
        needsAnalysis: false,
        usedStoredResumeText,
        parsingFailed: true,
        extractedWordCount,
      };
    }

    const fileTextOk = text.trim().length > 0 && extractedWordCount >= 20;

    // ── If the file is gone but we have stored Analysis, build the preview from
    //    stored keywords directly (no synthetic-text reconstruction). ──
    if (!fileTextOk) {
      console.log(`[Preview] File text unavailable for ${resume.fileName} — building preview from stored analysis`);
      return this._buildPreviewFromAnalysis(resume);
    }

    // ── Normal path: file is available, run full NLP pipeline ──
    const sections = extractSections(text);
    const nlp = runNlpAnalysis(text, AnalysisEngine.TECH_KEYWORDS);
    const lower = text.toLowerCase();

    // Find tech keywords for highlighting (using word-boundary matching)
    const techFound = AnalysisEngine.TECH_KEYWORDS.filter((k) => AnalysisEngine.matchKeyword(lower, k));
    const softFound = AnalysisEngine.findSoftSkillsInText(text);
    const verbsFound = AnalysisEngine.ACTION_VERBS.filter((v) => AnalysisEngine.matchKeyword(lower, v));

    // Build section map with content
    const sectionMap = [
      { name: "Summary", content: sections.summary, color: "#6366f1" },
      { name: "Experience", content: sections.experience, color: "#22c55e" },
      { name: "Skills", content: sections.skills, color: "#f59e0b" },
      { name: "Education", content: sections.education, color: "#3b82f6" },
      { name: "Projects", content: sections.projects, color: "#ec4899" },
      { name: "Certifications", content: sections.certifications, color: "#8b5cf6" },
    ].filter((s) => s.content.length > 0);

    // Top skills by frequency (for chart + word cloud)
    // FIX 1: Use \b word boundaries so "r" doesn't match every letter 'r'
    // FIX 2: Normalize to lowercase keys so "CSS" and "css" merge into one entry
    const skillFreq: Record<string, number> = {};
    const skillDisplay: Record<string, string> = {}; // lowercase → best display form

    for (const kw of [...techFound, ...nlp.dynamicSkills]) {
      const key = kw.toLowerCase();
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Word-boundary regex: prevents "r" from matching inside "university"
      const pattern = key.length <= 2
        ? new RegExp(`(?:^|[\\s,;|/()\\.\\[\\]])${escaped}(?:$|[\\s,;|/()\\.\\[\\]])`, "gi")
        : new RegExp(`\\b${escaped}\\b`, "gi");

      const count = (lower.match(pattern) || []).length;
      if (count === 0) continue;

      // Merge: accumulate into the lowercase key
      skillFreq[key] = (skillFreq[key] || 0) + count;

      // Keep the best display form (prefer UPPERCASE for acronyms, original case otherwise)
      if (!skillDisplay[key] || kw === kw.toUpperCase()) {
        skillDisplay[key] = kw.length <= 4 && kw === kw.toUpperCase() ? kw : kw;
      }
    }

    const topSkills = Object.entries(skillFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([key, count]) => ({ skill: skillDisplay[key] || key, count }));

    return {
      fullText: text,
      wordCount: extractedWordCount,
      sections: sectionMap,
      highlights: {
        techKeywords: techFound,
        softSkills: softFound,
        actionVerbs: verbsFound,
        dynamicSkills: nlp.dynamicSkills,
      },
      topSkills,
      industryClassification: nlp.industryClassification,
      fileAvailable: true,
      usedStoredResumeText,
      parsingFailed: false,
      extractedWordCount,
    };
  }

  /**
   * Build a usable resume-preview response from stored Analysis data only,
   * for cases where the original file is no longer accessible
   * (e.g., Vercel /tmp expired between invocations).
   */
  private _buildPreviewFromAnalysis(
    resume: { fileName: string; atsScore: number | null; analysis: { keywords: string[]; missingKeywords: string[] } | null },
  ) {
    const rawStoredKeywords = resume.analysis?.keywords ?? [];

    // ── Sanitize stored keywords ──
    // Older / failed analyses sometimes wrote sentinel strings into `keywords`
    // (e.g. "(unable to extract — upload text-based PDF)"). Those polluted the
    // "Detected Skills Cloud" with garbage. Filter aggressively: a real skill
    // is a short, mostly-alphanumeric token without parentheses or stop-phrases.
    const JUNK_PATTERNS = /unable|failed|extract|placeholder|n\/a|none|please|upload|text-based|scanned|empty|error/i;
    const storedKeywords = rawStoredKeywords.filter((k) => {
      if (typeof k !== "string") return false;
      const trimmed = k.trim();
      if (trimmed.length === 0 || trimmed.length > 56) return false;
      if (/[()[\]{}<>]/.test(trimmed)) return false;
      if (JUNK_PATTERNS.test(trimmed)) return false;
      return true;
    });

    // No usable analysis → return a clear empty state the frontend can render nicely
    if (storedKeywords.length === 0) {
      return {
        fullText: "",
        wordCount: 0,
        sections: [] as { name: string; content: string; color: string }[],
        highlights: { techKeywords: [], softSkills: [], actionVerbs: [], dynamicSkills: [] },
        topSkills: [] as { skill: string; count: number }[],
        industryClassification: { industries: [], primary: "General" },
        fileAvailable: false,
        needsAnalysis: true,
      };
    }

    // Match stored keywords against our known dictionaries to populate highlights
    const lowerKw = storedKeywords.map((k) => k.toLowerCase());
    const techFound = AnalysisEngine.TECH_KEYWORDS.filter((k) => lowerKw.includes(k.toLowerCase()));
    const softFromLlm = storedKeywords
      .filter((k) => /^soft:/i.test(k.trim()))
      .map((k) => k.replace(/^soft:\s*/i, "").trim())
      .filter((k) => k.length > 1 && k.length < 80);
    const softFromDict = AnalysisEngine.SOFT_SKILLS.filter((k) => lowerKw.includes(k.toLowerCase()));
    const softFound = [...new Set([...softFromLlm, ...softFromDict.map((k) =>
      k.split(/[\s-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(k.includes("-") ? "-" : " ")
    )])];
    // We can't reconstruct action verbs without the text, so leave empty
    const verbsFound: string[] = [];

    // Anything in storedKeywords that wasn't a known tech keyword → treat as dynamic skill
    const knownTechLower = new Set(AnalysisEngine.TECH_KEYWORDS.map((k) => k.toLowerCase()));
    const knownSoftLower = new Set(AnalysisEngine.SOFT_SKILLS.map((k) => k.toLowerCase()));
    const dynamicSkills = storedKeywords.filter(
      (k) =>
        !/^soft:/i.test(k.trim()) &&
        !knownTechLower.has(k.toLowerCase()) &&
        !knownSoftLower.has(k.toLowerCase())
    );

    // topSkills: synthesize descending counts so the bar chart still has visual weight order
    const allSkills = [...new Set([...techFound, ...dynamicSkills])];
    const topSkills = allSkills.slice(0, 15).map((skill, i) => ({
      skill,
      count: Math.max(1, allSkills.length - i),
    }));

    // Run industry classification on a comma-joined keyword string
    const keywordBlob = storedKeywords.join(", ");
    const industryClassification = classifyIndustry(keywordBlob);
    // Rough counts so Quick Stats aren’t all zeros when file + DB text are missing (legacy data)
    const estWords = Math.min(
      5000,
      Math.max(80, Math.round(keywordBlob.split(/\s+/).filter(Boolean).length * 1.4 + 180)),
    );
    const sectionSummary = {
      name: "Recovered from last analysis",
      content:
        "The original PDF is not on this server anymore (common on cloud hosting). Re-run Analyze Resume on a text-based PDF so we can save the extracted text to the database — then previews and AI highlights work without the file. Below are skills recovered from your stored keyword analysis.",
      color: "#6366f1",
    } as { name: string; content: string; color: string };

    return {
      fullText: "",
      wordCount: estWords,
      sections: [sectionSummary],
      highlights: {
        techKeywords: techFound,
        softSkills: softFound,
        actionVerbs: verbsFound,
        dynamicSkills,
      },
      topSkills,
      industryClassification,
      fileAvailable: false,
      needsAnalysis: false,
    };
  }

  async getHiringProbability(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const text = await this._getResumeTextWithFallback(resume);
    const a = resume.analysis ? { skillsScore: resume.analysis.skillsScore, experienceScore: resume.analysis.experienceScore, educationScore: resume.analysis.educationScore, projectsScore: resume.analysis.projectsScore, keywords: resume.analysis.keywords, missingKeywords: resume.analysis.missingKeywords } : null;
    return AnalysisEngine.calculateHiringProbability(text, resume.atsScore || 0, a);
  }

  async getGlobalBenchmark(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const a = resume.analysis ? { skillsScore: resume.analysis.skillsScore, experienceScore: resume.analysis.experienceScore, educationScore: resume.analysis.educationScore, projectsScore: resume.analysis.projectsScore } : null;
    return AnalysisEngine.getGlobalBenchmark(resume.atsScore || 0, a);
  }

  async getBadges(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const text = await this._extractResumeTextPreferringStored(resume);
    const a = resume.analysis ? { skillsScore: resume.analysis.skillsScore, experienceScore: resume.analysis.experienceScore, educationScore: resume.analysis.educationScore, projectsScore: resume.analysis.projectsScore, keywords: resume.analysis.keywords, suggestions: resume.analysis.suggestions } : null;
    return AnalysisEngine.calculateBadges(text, resume.atsScore || 0, a);
  }

  async detectIndustry(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._extractResumeTextPreferringStored(resume);

    // Use NLP semantic classification (weighted cosine)
    const nlpClassification = classifyIndustry(resumeText);

    // Also run the original keyword-based detection for additional detail
    const keywordDetection = AnalysisEngine.detectIndustry(resumeText);

    // Merge: prefer NLP classification but include recommended skills from keyword detection
    const merged = nlpClassification.industries.map((ind) => {
      const kwMatch = keywordDetection.detectedIndustries.find(
        (k) => k.name.toLowerCase().includes(ind.name.split("/")[0].trim().toLowerCase()) ||
               ind.name.toLowerCase().includes(k.name.split("&")[0].trim().toLowerCase())
      );
      return {
        name: ind.name,
        confidence: ind.confidence,
        matchedKeywords: ind.topMatches,
        recommendedSkills: kwMatch?.recommendedSkills || [],
      };
    });

    // Add any keyword-detected industries not in NLP results
    for (const kw of keywordDetection.detectedIndustries) {
      if (!merged.some((m) => m.name.toLowerCase().includes(kw.name.split("&")[0].trim().toLowerCase()))) {
        merged.push(kw);
      }
    }

    return {
      detectedIndustries: merged.slice(0, 4),
      primaryField: nlpClassification.primary,
    };
  }

  async analyzeReadability(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._getResumeTextWithFallback(resume);
    return AnalysisEngine.analyzeReadability(resumeText);
  }

  /**
   * Build fallback resume context from stored analysis data when file extraction fails
   * (e.g., on Vercel where /tmp is ephemeral between serverless invocations)
   */
  private async _getResumeTextWithFallback(
    resume: {
      fileUrl: string;
      fileName: string;
      storedResumeText?: string | null;
      atsScore?: number | null;
      analysis?: { keywords: string[]; missingKeywords: string[]; suggestions: string[]; skillsScore: number; experienceScore: number; educationScore: number; projectsScore: number } | null;
    },
  ): Promise<string> {
    let text = await this._extractResumeTextPreferringStored({
      fileUrl: resume.fileUrl,
      fileName: resume.fileName,
      storedResumeText: resume.storedResumeText ?? null,
    });

    // If we got meaningful text from the file, return it
    if (text.trim() && text.split(/\s+/).length >= 20) {
      return text;
    }

    // File not accessible (Vercel ephemeral /tmp) — build context from stored data
    const storedKeywords = resume.analysis?.keywords || [];
    const a = resume.analysis;

    if (storedKeywords.length > 0) {
      // Best fallback: we have keywords from a previous analysis
      console.log(`[Fallback] File not accessible — building context from ${storedKeywords.length} stored keywords`);
      text = `Resume for ${resume.fileName}.\n` +
        `Skills & Technologies: ${storedKeywords.join(", ")}.\n` +
        `ATS Score: ${resume.atsScore ?? 0}%.\n` +
        `Skills Score: ${a?.skillsScore ?? 0}%. Experience Score: ${a?.experienceScore ?? 0}%. ` +
        `Education Score: ${a?.educationScore ?? 0}%. Projects Score: ${a?.projectsScore ?? 0}%.`;
      if (a?.suggestions && a.suggestions.length > 0) {
        text += `\nKey suggestions: ${a.suggestions.slice(0, 3).join("; ")}.`;
      }
    } else if (a) {
      // We have an analysis record but no keywords — use scores + fileName
      console.log("[Fallback] File not accessible, no keywords — using scores and fileName");
      text = `Resume: ${resume.fileName}. ATS Score: ${resume.atsScore ?? 0}%. ` +
        `Skills: ${a.skillsScore}%. Experience: ${a.experienceScore}%. ` +
        `Education: ${a.educationScore}%. Projects: ${a.projectsScore}%.`;
    } else {
      // No analysis at all — use fileName as minimal hint
      console.log("[Fallback] File not accessible, no analysis — using fileName only");
      const nameHint = resume.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      text = `Resume file: ${nameHint}. This resume has not been analyzed yet. ` +
        `Please analyze the resume first to get accurate career suggestions.`;
    }

    return text;
  }

  async getCareerGrowth(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._getResumeTextWithFallback(resume);

    // Use LLM for smarter career growth analysis
    if (isLlmAvailable() && resumeText.split(/\s+/).length > 10) {
      console.log("[Career] Using Gemini AI for career growth...");
      const llmResult = await llmCareerGrowth(resumeText);
      if (llmResult) return llmResult;
    }

    // Fallback to rule-based
    return AnalysisEngine.getCareerGrowth(resumeText);
  }

  async suggestProjects(resumeId: string, userId: string) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._getResumeTextWithFallback(resume);

    // Use LLM for complexity-aware suggestions
    if (isLlmAvailable() && resumeText.split(/\s+/).length > 10) {
      console.log("[Projects] Using Gemini AI for complexity-aware suggestions...");
      const llmResult = await llmSuggestProjects(resumeText);
      if (llmResult?.projects && llmResult.projects.length > 0) {
        return llmResult;
      }
    }

    // Fallback to rule-based
    return AnalysisEngine.suggestProjects(resumeText);
  }

  async evaluateAnswer(resumeId: string, userId: string, question: string, answer: string) {
    const [resume, userRow] = await Promise.all([
      prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    if (!resume) throw new Error("Resume not found");
    const accountName = userRow?.name?.trim() || undefined;

    if (isLlmAvailable()) {
      const resumeText = await this._getResumeTextWithFallback(resume);
      const llmResult = await llmEvaluateAnswer(question, answer, resumeText, accountName);
      if (llmResult) {
        return {
          score: llmResult.scoreOutOf10 * 10,
          scoreOutOf10: llmResult.scoreOutOf10,
          grade: llmResult.grade,
          strengths: llmResult.strengths,
          feedback: llmResult.feedback,
          techMentioned: llmResult.techMentioned,
          starFeedback: llmResult.starFeedback,
        };
      }
    }

    const keywords = resume.analysis?.keywords || [];
    return AnalysisEngine.evaluateAnswer(question, answer, keywords);
  }

  async interviewPredictor(resumeId: string, userId: string, jobDescription: string) {
    const resumeText = await this.getResumeText(resumeId, userId);
    const userRow = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const accountName = userRow?.name?.trim() || undefined;
    const result = await llmInterviewPredictor(resumeText, jobDescription, accountName);
    return result;
  }

  async chat(
    resumeId: string,
    userId: string,
    question: string,
    history?: ChatHistoryTurn[]
  ) {
    const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } });
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._getResumeTextWithFallback(resume);

    // ── Try LLM first ──
    if (isLlmAvailable()) {
      const context = resume.analysis
        ? `ATS Score: ${resume.atsScore}%, Skills: ${resume.analysis.skillsScore}%, Experience: ${resume.analysis.experienceScore}%, Keywords: ${resume.analysis.keywords.join(", ")}, Missing: ${resume.analysis.missingKeywords.join(", ")}`
        : "No analysis data yet";
      const llmResult = await llmChat(resumeText, context, question, history);
      if (llmResult) return llmResult;
    }

    const analysisData = resume.analysis ? {
      atsScore: resume.atsScore || 0,
      keywords: resume.analysis.keywords,
      missingKeywords: resume.analysis.missingKeywords,
      suggestions: resume.analysis.suggestions,
      skillsScore: resume.analysis.skillsScore,
      experienceScore: resume.analysis.experienceScore,
      educationScore: resume.analysis.educationScore,
      projectsScore: resume.analysis.projectsScore,
    } : null;
    return AnalysisEngine.chatAnswer(question, resumeText, analysisData);
  }

  async generateContent(resumeId: string, userId: string, jobDescription: string, type: "cover_letter" | "linkedin_summary" | "professional_bio") {
    const [resume, userRow] = await Promise.all([
      prisma.resume.findFirst({ where: { id: resumeId, userId }, include: { analysis: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    if (!resume) throw new Error("Resume not found");
    const resumeText = await this._getResumeTextWithFallback(resume);
    const accountName = userRow?.name?.trim() || undefined;

    if (looksLikeExtractionPlaceholder(resumeText)) {
      throw new ClientError(
        "Resume text is missing or invalid. Upload a text-based PDF and run analysis before generating content.",
        422,
        "PARSING_FAILED",
      );
    }
    const wcContent = countWords(resumeText);
    if (wcContent < MIN_WORDS_FOR_SCORING) {
      throw new ClientError(
        `Not enough resume text to generate content (${wcContent} words; need at least ${MIN_WORDS_FOR_SCORING}). Run analysis on a text-based PDF first.`,
        422,
        "INSUFFICIENT_TEXT",
      );
    }

    if (isLlmAvailable() && resumeText.split(/\s+/).length > 10) {
      console.log(`[Content] Using Gemini AI for ${type}...`);
      const llmResult = await llmGenerateContent(resumeText, jobDescription, type, accountName);
      if (llmResult) return llmResult;
    }

    return AnalysisEngine.generateContent(resumeText, jobDescription, type, accountName);
  }

  async compareResumes(oldResumeId: string, newResumeId: string, userId: string) {
    const [oldResume, newResume] = await Promise.all([
      prisma.resume.findFirst({ where: { id: oldResumeId, userId }, include: { analysis: true } }),
      prisma.resume.findFirst({ where: { id: newResumeId, userId }, include: { analysis: true } }),
    ]);
    if (!oldResume || !newResume) throw new Error("Resume not found");

    // Use stored ATS + section scores as SSOT
    const oldScore = oldResume.atsScore ?? 0;
    const newScore = newResume.atsScore ?? 0;
    const rawAtsDelta = newScore - oldScore;

    const oldA = oldResume.analysis;
    const newA = newResume.analysis;

    const oldReliable =
      !!oldA && !isDegenerateAnalysis(
        oldScore, oldA.skillsScore, oldA.experienceScore, oldA.educationScore, oldA.projectsScore,
      );
    const newReliable =
      !!newA && !isDegenerateAnalysis(
        newScore, newA.skillsScore, newA.experienceScore, newA.educationScore, newA.projectsScore,
      );
    /** Both sides have trustworthy section rows for the “Change” column */
    const fullComparisonReliable = oldReliable && newReliable;
    /**
     * ATS headline improvement: trust **new** resume analysis. A low or broken
     * *old* snapshot (e.g. 1% from a failed run) should not hide a real gain (e.g. 68% new).
     */
    const atsHeadlineValid = newReliable;

    type Side = "old" | "new" | "both" | null;
    let unreliableSide: Side = null;
    if (!oldReliable && !newReliable) unreliableSide = "both";
    else if (!oldReliable) unreliableSide = "old";
    else if (!newReliable) unreliableSide = "new";

    let improvement: number;
    let verdict: string;

    if (!atsHeadlineValid) {
      improvement = 0;
      if (unreliableSide === "both") {
        verdict = "Cannot compare — run analysis on both resumes (stored scores look incomplete or missing).";
      } else {
        verdict = "Cannot compare — the new resume's analysis looks broken or never completed. Re-run analysis, then compare again.";
      }
    } else {
      improvement = rawAtsDelta;
      const tier =
        improvement > 15 ? "Major Improvement! 🎉" :
          improvement > 5 ? "Good Progress! 👍" :
            improvement > 0 ? "Slight Improvement" :
              improvement === 0 ? "No Change" : "Score Decreased ⚠️";
      if (!oldReliable) {
        verdict = `${tier} (Earlier resume had very low or incomplete section scores; ATS change is still shown.)`;
      } else {
        verdict = tier;
      }
    }

    const comparisons = [
      { label: "ATS Score", old: oldScore, new: newScore, unit: "%" },
      { label: "Skills", old: oldA?.skillsScore ?? 0, new: newA?.skillsScore ?? 0, unit: "%" },
      { label: "Experience", old: oldA?.experienceScore ?? 0, new: newA?.experienceScore ?? 0, unit: "%" },
      { label: "Education", old: oldA?.educationScore ?? 0, new: newA?.educationScore ?? 0, unit: "%" },
      { label: "Projects", old: oldA?.projectsScore ?? 0, new: newA?.projectsScore ?? 0, unit: "%" },
      { label: "Keywords Found", old: oldA?.keywords?.length ?? 0, new: newA?.keywords?.length ?? 0, unit: "" },
      { label: "Missing Keywords", old: oldA?.missingKeywords?.length ?? 0, new: newA?.missingKeywords?.length ?? 0, unit: "" },
    ];

    return {
      oldScore,
      newScore,
      improvement,
      rawAtsDelta,
      /** @deprecated use fullComparisonReliable; kept for older clients */
      comparisonReliable: fullComparisonReliable,
      fullComparisonReliable,
      atsHeadlineValid,
      unreliableSide,
      verdict,
      comparisons,
    };
  }
}

export const analysisService = new AnalysisService();
