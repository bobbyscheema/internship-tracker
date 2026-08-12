import type { ResumeProfile, Role } from "@/types";

const SKILLS = [
  "python", "java", "c++", "c", "typescript", "javascript", "react", "next.js", "node.js", "sql",
  "pytorch", "tensorflow", "scikit-learn", "machine learning", "deep learning", "nlp", "computer vision",
  "aws", "gcp", "azure", "docker", "kubernetes", "linux", "git", "spark", "pandas", "numpy",
  "algorithms", "data structures", "distributed systems", "statistics", "probability", "optimization",
  "trading", "finance", "rust", "go", "scala", "r"
];

export function extractSkills(text: string) {
  const normalized = text.toLowerCase();
  return SKILLS.filter((skill) => new RegExp(`(^|[^a-z0-9+])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+]|$)`, "i").test(normalized));
}

export function scoreRole(role: Role, resume?: ResumeProfile): Pick<Role, "matchScore" | "matchReasons"> {
  if (!resume) return {};
  const desired = new Set(role.skills.map((s) => s.toLowerCase()));
  const owned = new Set(resume.skills.map((s) => s.toLowerCase()));
  const matches = [...desired].filter((skill) => owned.has(skill));
  const skillScore = desired.size ? Math.min(55, (matches.length / desired.size) * 55) : 25;
  const levelScore = role.experience.includes("sophomore") || role.experience.includes("all-undergrad") ? 22 : 11;
  const trackSignals = extractSkills(`${role.title} ${role.description}`).filter((skill) => owned.has(skill));
  const relevanceScore = Math.min(15, trackSignals.length * 3);
  const locationScore = resume.locations.some((loc) => role.location.toLowerCase().includes(loc.toLowerCase())) ? 8 : 4;
  const score = Math.round(Math.min(98, skillScore + levelScore + relevanceScore + locationScore));
  const reasons = [
    matches.length ? `${matches.slice(0, 4).join(", ")} align with the role` : "Your general profile overlaps with this role",
    role.experience.includes("sophomore") ? "Explicitly sophomore-friendly" : "Open to undergraduates",
    resume.graduationYear ? `Graduation timing (${resume.graduationYear}) considered` : "Experience level considered",
  ];
  return { matchScore: score, matchReasons: reasons };
}
