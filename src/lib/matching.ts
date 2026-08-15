import type { ResumeProfile, Role, RoleTrack } from "@/types";

const SKILL_ALIASES: Record<string, string[]> = {
  python: ["python"], java: ["java"], "c++": ["c++", "cpp"], c: [" c ", "c language"],
  typescript: ["typescript", "ts"], javascript: ["javascript", "js"], react: ["react", "react.js"],
  "next.js": ["next.js", "nextjs"], "node.js": ["node.js", "nodejs"], sql: ["sql", "postgres", "mysql", "sqlite"],
  pytorch: ["pytorch"], tensorflow: ["tensorflow"], "scikit-learn": ["scikit-learn", "sklearn"],
  "machine learning": ["machine learning", "ml model", "neural network"], "deep learning": ["deep learning", "transformer", "cnn", "rnn"],
  nlp: ["nlp", "natural language processing", "language model", "llm"], "computer vision": ["computer vision", "opencv", "image classification"],
  aws: ["aws", "amazon web services"], gcp: ["gcp", "google cloud"], azure: ["azure"], docker: ["docker", "containerized"],
  kubernetes: ["kubernetes", "k8s"], linux: ["linux", "unix"], git: ["git", "github", "version control"],
  spark: ["spark", "pyspark"], pandas: ["pandas"], numpy: ["numpy"], algorithms: ["algorithms", "algorithmic"],
  "data structures": ["data structures", "dsa"], "distributed systems": ["distributed systems", "microservices", "distributed computing"],
  statistics: ["statistics", "statistical"], probability: ["probability", "stochastic"], optimization: ["optimization", "linear programming"],
  finance: ["finance", "financial", "markets"], trading: ["trading", "market making", "order book"], rust: ["rust"], go: ["golang", " go "],
  scala: ["scala"], r: [" r ", "r programming"], api: ["rest api", "restful", "graphql", "api development"],
  testing: ["unit test", "integration test", "pytest", "jest", "testing"], cloud: ["cloud infrastructure", "cloud computing"],
  databases: ["database", "databases", "mongodb", "redis"], networking: ["networking", "tcp", "http"],
  concurrency: ["concurrency", "multithreading", "parallel programming"], "operating systems": ["operating systems", "kernel", "systems programming"],
};

const TRACK_TERMS: Record<RoleTrack, string[]> = {
  swe: ["software engineering", "backend", "frontend", "full stack", "api", "distributed systems", "database", "cloud", "systems"],
  ml: ["machine learning", "deep learning", "nlp", "computer vision", "pytorch", "tensorflow", "model", "data science"],
  quant: ["quantitative developer", "quant developer", "low latency", "trading", "market", "finance", "c++", "probability", "statistics"],
};

const COURSEWORK = ["data structures", "algorithms", "operating systems", "computer networks", "database systems", "machine learning", "artificial intelligence", "linear algebra", "probability", "statistics", "calculus", "distributed systems"];
const ACTION_TERMS = ["built", "developed", "implemented", "designed", "optimized", "deployed", "led", "created", "improved", "reduced", "increased", "trained", "automated", "scaled"];

function includesTerm(text: string, term: string) {
  const padded = ` ${text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ")} `;
  const needle = term.toLowerCase();
  return needle.startsWith(" ") || needle.endsWith(" ") ? padded.includes(needle) : new RegExp(`(^|[^a-z0-9+])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+]|$)`, "i").test(padded);
}

export function extractSkills(text: string) {
  return Object.entries(SKILL_ALIASES).filter(([, aliases]) => aliases.some((alias) => includesTerm(text, alias))).map(([skill]) => skill);
}

export function analyzeResumeText(text: string) {
  const normalized = text.toLowerCase();
  const skills = extractSkills(text);
  const coursework = COURSEWORK.filter((course) => normalized.includes(course));
  const keywords = [...new Set([...skills, ...coursework, ...ACTION_TERMS.filter((term) => includesTerm(text, term))])];
  const trackSignals = Object.fromEntries(Object.entries(TRACK_TERMS).map(([track, terms]) => [track, terms.filter((term) => includesTerm(text, term)).length])) as Record<RoleTrack, number>;
  return { skills, coursework, keywords, trackSignals };
}

function graduationFit(role: Role, year?: number) {
  if (!year) return 5;
  const likelyClass = year === 2029 ? "sophomore" : year === 2028 ? "junior" : year === 2027 ? "senior" : undefined;
  return role.experience.includes("all-undergrad") || (likelyClass && role.experience.includes(likelyClass)) ? 10 : 5;
}

export function scoreRole(role: Role, resume?: ResumeProfile): Pick<Role, "matchScore" | "matchReasons" | "matchDetails"> {
  if (!resume) return {};
  const analyzed = analyzeResumeText(resume.text);
  const owned = new Set([...resume.skills, ...analyzed.skills].map((skill) => skill.toLowerCase()));
  const roleSignals = extractSkills(`${role.title} ${role.description} ${role.requirements.join(" ")} ${role.skills.join(" ")}`);
  const desired = [...new Set([...role.skills.map((skill) => skill.toLowerCase()), ...roleSignals])];
  const matchedSkills = desired.filter((skill) => owned.has(skill));
  const missingSkills = desired.filter((skill) => !owned.has(skill)).slice(0, 6);
  const skillFit = desired.length ? Math.round(40 * (matchedSkills.length / desired.length)) : 10;
  const trackEvidence = analyzed.trackSignals[role.track] ?? resume.trackSignals?.[role.track] ?? 0;
  const trackFit = Math.min(18, 5 + trackEvidence * 3);
  const levelFit = role.experience.includes("sophomore") ? 10 : role.experience.includes("all-undergrad") ? 8 : 4;
  const gradFit = graduationFit(role, resume.graduationYear);
  const eligibilityFit = levelFit + gradFit;
  const actionCount = ACTION_TERMS.filter((term) => includesTerm(resume.text, term)).length;
  const quantified = (resume.text.match(/\b\d+(?:\.\d+)?%|\b\d+[xX]\b|\$\d+/g) ?? []).length;
  const evidenceFit = Math.min(17, 5 + Math.min(7, actionCount) + Math.min(5, quantified));
  const locationFit = resume.locations.some((location) => role.location.toLowerCase().includes(location.toLowerCase())) ? 7 : 4;
  const score = Math.round(Math.min(98, skillFit + trackFit + eligibilityFit + evidenceFit + locationFit));
  const matchReasons = [
    matchedSkills.length ? `${matchedSkills.slice(0, 4).join(", ")} match the posting` : `Your ${role.track.toUpperCase()} foundation provides partial overlap`,
    role.experience.includes("sophomore") ? "Explicitly sophomore-friendly" : role.experience.includes("all-undergrad") ? "Open to all undergraduates" : "Undergraduate eligibility considered",
    evidenceFit >= 13 ? "Strong action-oriented or quantified resume evidence" : "Projects and impact can be tailored more directly",
  ];
  return { matchScore: score, matchReasons, matchDetails: { skillFit, trackFit, eligibilityFit, evidenceFit, locationFit, matchedSkills: matchedSkills.slice(0, 8), missingSkills } };
}
