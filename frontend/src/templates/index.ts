// Resume templates for future expansion
export const resumeTemplates = {
  modern: "modern",
  classic: "classic",
  minimal: "minimal",
} as const;

export type ResumeTemplate = keyof typeof resumeTemplates;
