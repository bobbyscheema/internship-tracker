export type RoleTrack = "swe" | "ml" | "quant";
export type WorkMode = "onsite" | "hybrid";
export type Experience = "sophomore" | "junior" | "senior" | "all-undergrad";

export interface RecruitingEvent {
  id: string;
  company: string;
  title: string;
  description: string;
  startAt: string;
  endAt?: string;
  registrationDeadline?: string;
  location: string;
  format: "virtual" | "in-person" | "hybrid";
  category: "info-session" | "career-fair" | "hackathon" | "tech-talk" | "workshop" | "conference" | "other";
  audience: string;
  registrationUrl: string;
  sourceName: string;
}

export interface Role {
  id: string;
  company: string;
  title: string;
  track: RoleTrack;
  location: string;
  workMode: WorkMode;
  experience: Experience[];
  description: string;
  requirements: string[];
  skills: string[];
  postedAt: string;
  deadline?: string;
  sourceUrl: string;
  source: string;
  featured: boolean;
  featuredGroup?: "Big Tech" | "Quant" | "Top AI";
  matchScore?: number;
  matchReasons?: string[];
  matchDetails?: {
    skillFit: number;
    trackFit: number;
    eligibilityFit: number;
    evidenceFit: number;
    locationFit: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
}

export interface InterviewInsight {
  id: string;
  roleId: string;
  type: "oa" | "technical" | "behavioral" | "general";
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: string;
}

export interface ResumeProfile {
  filename: string;
  uploadedAt: string;
  text: string;
  skills: string[];
  graduationYear?: number;
  locations: string[];
  keywords?: string[];
  coursework?: string[];
  trackSignals?: Record<RoleTrack, number>;
}

export interface TailoredResume {
  roleId: string;
  generatedAt: string;
  company: string;
  roleTitle: string;
  headline: string;
  summary: string;
  reorderedSkills: string[];
  atsKeywords: string[];
  bulletRewrites: { original: string; tailored: string; why: string }[];
  projectRewrites: { original: string; tailored: string; why: string }[];
  gapAnalysis: string[];
  integrityNotes: string[];
}
