export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isPro?: boolean;
  aiCredits?: number;
  createdAt: string;
}

export type UserRole =
  | "fresher"
  | "developer"
  | "software_engineer"
  | "ai_engineer"
  | "ai_ml_engineer"
  | "other";

export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: "fresher", label: "Fresher" },
  { value: "developer", label: "Developer" },
  { value: "software_engineer", label: "Software Engineer" },
  { value: "ai_engineer", label: "AI Engineer" },
  { value: "ai_ml_engineer", label: "AI/ML Engineer" },
  { value: "other", label: "Other" },
];

export interface Resume {
  id: string;
  userId: string;
  fileUrl: string;
  fileName: string;
  /** Canonical headline ATS % — use everywhere vs. derived “readiness” metrics */
  atsScore: number | null;
  createdAt: string;
  /** Present when returned from API — used to pick “latest analyzed” resume for dashboard */
  updatedAt?: string;
  analysis?: Analysis;
}

export interface Analysis {
  id: string;
  resumeId: string;
  /** Section scores 0–100; headline ATS lives on `Resume.atsScore`, not here */
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  projectsScore: number;
  jobMatchScore: number;
  suggestions: string[];
  /** Technical + dynamic keywords; may include `Soft:Label` entries from AI analysis */
  keywords: string[];
  missingKeywords: string[];
  /** When returned from API — last analysis write time */
  updatedAt?: string;
  metrics?: {
    grammarScore: number;
    impactScore: number;
    formattingScore: number;
    keywordScore: number;
  };
}

export interface JobMatch {
  overallScore: number;
  skillMatch: number;
  experienceMatch: number;
  educationMatch: number;
  keywordsFound: string[];
  missingKeywords: string[];
  suggestions: string[];
}

export interface DashboardStats {
  totalResumes: number;
  averageAtsScore: number;
  bestAtsScore: number;
  recentAnalyses: Analysis[];
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface InterviewQuestion {
  category: string;
  question: string;
  tip: string;
}

export interface InterviewQuestionsResponse {
  totalQuestions: number;
  questions: InterviewQuestion[];
}

export interface SectionAnalysis {
  name: string;
  found: boolean;
  score: number;
  grade: string;
  issues: string[];
  tips: string[];
}

export interface SectionAnalysisResponse {
  overall: number;
  sections: SectionAnalysis[];
}

export interface RewriteResponse {
  original: string;
  rewritten: string;
  changes: string[];
}

export interface SmartFeedbackItem {
  original: string;
  improved: string;
  issue: string;
  category: string;
  severity: "high" | "medium" | "low";
}

export interface SmartFeedbackResponse {
  score: number;
  totalLinesScanned: number;
  issuesFound: number;
  summary: { high: number; medium: number; low: number };
  feedback: SmartFeedbackItem[];
}

export interface IndustryDetection {
  detectedIndustries: {
    name: string;
    confidence: number;
    matchedKeywords: string[];
    recommendedSkills: string[];
  }[];
  primaryField: string;
}

export interface ReadabilityResult {
  score: number;
  grade: string;
  metrics: {
    avgSentenceLength: number;
    avgWordLength: number;
    totalSentences: number;
    totalWords: number;
    longSentences: number;
    longBullets: number;
    shortBullets: number;
    passiveVoice: number;
    complexWords: number;
  };
  tips: string[];
}

export interface GeneratedContent {
  type: string;
  content: string;
}

export interface ResumeComparison {
  oldScore: number;
  newScore: number;
  /** ATS change (new − old) when the new resume’s analysis is trustworthy */
  improvement: number;
  /** Always `newScore - oldScore`, even when comparison is not reliable (for debugging / transparency) */
  rawAtsDelta?: number;
  /**
   * Legacy: true when *both* sides look trustworthy (use `fullComparisonReliable` if present).
   * Kept for older deployed backends.
   */
  comparisonReliable?: boolean;
  /** True when both old and new section scores are safe to use for per-row “Change” badges */
  fullComparisonReliable?: boolean;
  /** True when the new resume’s analysis is solid enough to show headline ATS improvement */
  atsHeadlineValid?: boolean;
  unreliableSide?: "old" | "new" | "both" | null;
  verdict: string;
  comparisons: { label: string; old: number; new: number; unit: string }[];
}

export interface ResumePreview {
  fullText: string;
  wordCount: number;
  sections: { name: string; content: string; color: string }[];
  highlights: {
    techKeywords: string[];
    softSkills: string[];
    actionVerbs: string[];
    dynamicSkills: string[];
  };
  topSkills: { skill: string; count: number }[];
  industryClassification: {
    industries: { name: string; confidence: number; topMatches: string[] }[];
    primary: string;
  };
  /** True when original resume file text was extracted; false when preview was rebuilt from stored analysis only */
  fileAvailable?: boolean;
  /** True when the resume has no stored analysis yet — user should run Analysis first */
  needsAnalysis?: boolean;
  /** Preview body was loaded from `storedResumeText` (last analyze) because the PDF was missing or too short */
  usedStoredResumeText?: boolean;
  /** True when extracted text is unusable (e.g. legacy failed-parse blob) — show parsing error UI, not scores */
  parsingFailed?: boolean;
  /** Word count from the text source used for preview (file or stored); for toasts / low-text warnings */
  extractedWordCount?: number;
}

export interface HiringProbability {
  probability: number;
  factors: { name: string; value: number; weight: string; impact: "positive" | "negative" }[];
  verdict: string;
}

export interface GlobalBenchmark {
  percentile: number;
  rank: string;
  comparisons: { label: string; value: number; highlight: boolean }[];
  sectionBenchmarks: { section: string; yours: number; average: number }[];
  beatsPercent: number;
}

export interface BadgeData {
  id: string; name: string; icon: string; description: string; earned: boolean; progress: number;
}

export interface BadgesResponse {
  badges: BadgeData[];
  earned: number;
  total: number;
}

export interface CareerGrowth {
  currentLevel: string;
  nextRole: string;
  yearsExperience: number;
  timeframe: string;
  skillsToLearn: string[];
  allPaths: { from: string; to: string; timeframe: string; skillsNeeded: string[] }[];
}

export interface ProjectSuggestion {
  title: string;
  description: string;
  techStack: string[];
  difficulty: string;
  relevance: number;
}

export interface AnswerEvaluation {
  /** 0–100 scale (compatible with running averages); derived from scoreOutOf10 when using AI */
  score: number;
  /** Primary display score for mock interview feedback */
  scoreOutOf10?: number;
  grade: string;
  strengths: string[];
  feedback: string[];
  techMentioned: string[];
  /** STAR-oriented coaching paragraph */
  starFeedback?: string;
}

export type ChatHistoryTurn = { role: "user" | "assistant"; content: string };

export interface ChatResponse {
  answer: string;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}
