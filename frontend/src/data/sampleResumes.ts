import type { Analysis } from "@/types";

export interface SampleResume {
  id: string;
  name: string;
  role: string;
  years: string;
  emoji: string;
  fileName: string;
  atsScore: number;
  analysis: Analysis;
}

export const SAMPLE_RESUMES: SampleResume[] = [
  {
    id: "sample-isabel",
    name: "Isabel Martinez",
    role: "Marketing Manager",
    years: "5+ years",
    emoji: "📄",
    fileName: "Isabel_Martinez_Resume.pdf",
    atsScore: 72,
    analysis: {
      id: "sample-analysis-isabel",
      resumeId: "sample-isabel",
      skillsScore: 78,
      experienceScore: 80,
      educationScore: 65,
      projectsScore: 55,
      jobMatchScore: 0,
      keywords: [
        "Digital Marketing", "SEO", "Google Analytics", "Content Strategy",
        "Social Media", "Email Marketing", "HubSpot", "Campaign Management",
        "A/B Testing", "Brand Strategy", "Team Leadership",
      ],
      missingKeywords: [
        "Marketing Automation", "Salesforce", "PPC", "Data Visualization",
        "CRM Integration", "Programmatic Advertising",
      ],
      suggestions: [
        "Add quantified metrics to your experience: 'Grew organic traffic by 150%' instead of 'Improved SEO'.",
        "Include a dedicated 'Tools & Platforms' section listing HubSpot, Google Ads, Salesforce, etc.",
        "Your resume is missing PPC and paid advertising experience — consider adding relevant campaigns.",
        "Add a professional summary at the top highlighting your 5+ years and key achievements.",
        "Include leadership metrics: team size managed, budget responsibility, revenue influenced.",
        "Consider adding certifications: Google Ads, HubSpot Inbound Marketing, Facebook Blueprint.",
      ],
    },
  },
  {
    id: "sample-john",
    name: "John Chen",
    role: "Software Engineer",
    years: "8+ years",
    emoji: "📄",
    fileName: "John_Chen_Resume.pdf",
    atsScore: 85,
    analysis: {
      id: "sample-analysis-john",
      resumeId: "sample-john",
      skillsScore: 92,
      experienceScore: 88,
      educationScore: 80,
      projectsScore: 75,
      jobMatchScore: 0,
      keywords: [
        "Python", "TypeScript", "React", "Node.js", "AWS", "Docker",
        "PostgreSQL", "MongoDB", "REST API", "GraphQL", "CI/CD",
        "Microservices", "System Design", "Agile", "Git",
      ],
      missingKeywords: [
        "Kubernetes", "Terraform", "Go", "Machine Learning",
        "Performance Optimization", "Technical Writing",
      ],
      suggestions: [
        "Strong technical keyword coverage. Add Kubernetes and Terraform to strengthen your DevOps profile.",
        "Quantify project impacts: 'Reduced API latency by 40%' or 'Served 10M+ daily requests'.",
        "Your projects section could use live demo links and GitHub repository URLs.",
        "Add a 'System Design' bullet point describing architecture decisions you've made at scale.",
        "Consider adding open-source contributions or technical blog posts to stand out.",
      ],
    },
  },
];
