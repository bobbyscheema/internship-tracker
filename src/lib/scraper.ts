import crypto from "node:crypto";
import { extractSkills } from "@/lib/matching";
import { deactivateAllRoles, finishScrape, getSetting, saveInsight, startScrape, upsertRole } from "@/lib/store";
import type { Experience, InterviewInsight, Role, RoleTrack } from "@/types";

const DEFAULT_BOARDS = [
  "openai", "anthropic", "stripe", "figma", "datadog", "roblox", "lyft", "cloudflare",
  "scaleai", "andurilindustries", "spacex", "twosigma", "citadel", "nvidia", "airbnb"
];

const FEATURED: Record<string, Role["featuredGroup"]> = {
  openai: "Top AI", anthropic: "Top AI", scaleai: "Top AI", nvidia: "Top AI",
  stripe: "Big Tech", figma: "Big Tech", roblox: "Big Tech", airbnb: "Big Tech",
  twosigma: "Quant", citadel: "Quant"
};

const COMPANY_NAMES: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", scaleai: "Scale AI", nvidia: "NVIDIA",
  stripe: "Stripe", figma: "Figma", datadog: "Datadog", roblox: "Roblox", lyft: "Lyft",
  cloudflare: "Cloudflare", airbnb: "Airbnb", spacex: "SpaceX", twosigma: "Two Sigma",
  citadel: "Citadel", andurilindustries: "Anduril Industries"
};

const QUANT_FIRMS = new Set([
  "akuna capital", "aquatic capital management", "aqr capital management", "belvedere trading",
  "blackrock", "balyasny asset management", "bridgewater associates", "brevan howard", "capula investment management",
  "chicago trading company", "citadel", "citadel securities", "cubist systematics", "d. e. shaw", "de shaw",
  "drw", "engineers gate", "five rings", "gelber group", "g-research", "headlands technologies",
  "hpr (hyannis port research)", "hudson bay capital", "hudson river trading", "imc", "imc trading",
  "jane street", "jump trading", "jump trading group", "man group", "marshall wace", "maven securities",
  "millennium", "old mission", "optiver", "pdt partners", "point72", "quadrature", "quadrillion",
  "quantbot technologies", "radix trading", "renaissance technologies", "schonfeld", "sig", "squarepoint capital",
  "susquehanna international group", "tower research capital", "transmarket group", "two sigma",
  "valkyrie trading", "virtu financial", "walleye capital", "wolverine trading", "worldquant", "xtx markets"
]);

const ELITE_QUANT = new Set([
  "citadel", "citadel securities", "d. e. shaw", "de shaw", "five rings", "headlands technologies",
  "hudson river trading", "imc", "imc trading", "jane street", "jump trading", "jump trading group",
  "optiver", "radix trading", "tower research capital", "two sigma", "xtx markets"
]);
const BIG_TECH = new Set(["airbnb", "amazon", "apple", "coinbase", "databricks", "figma", "google", "meta", "microsoft", "netflix", "nvidia", "roblox", "snowflake", "stripe"]);
const TOP_AI = new Set(["anthropic", "character.ai", "cohere", "mistral ai", "nvidia", "openai", "perplexity ai", "scale ai", "xai"]);
const EXCLUDED_COMPANIES = new Set(["bytedance", "tiktok"]);

interface SimplifyListing {
  source: string;
  category: string;
  company_name: string;
  id: string;
  title: string;
  active: boolean;
  terms: string[];
  date_posted: number;
  date_updated: number;
  url: string;
  locations: string[];
  is_visible: boolean;
  degrees?: string[];
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  location: { name: string };
  content?: string;
  departments?: { name: string }[];
  metadata?: { name: string; value: string | string[] | null }[];
}

const textOnly = (html = "") => html
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
  .replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
const idFor = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);

function isInternship(title: string) {
  const value = title.toLowerCase();
  return /\b(intern|internship)\b/.test(value) && !/graduate intern|phd intern|postdoc|mba intern/.test(value);
}

function isSummer2027Relevant(title: string, body: string, postedAt: Date) {
  const all = `${title} ${body}`.toLowerCase();
  if (/\b(2024|2025|2026|2028|2029)\b/.test(all)) return false;
  if (/\b(fall|winter|spring)\b/.test(all) || /co-?op/.test(all)) return false;
  if (/summer\s*2027|2027\s*summer/.test(all)) return true;
  const start = new Date("2026-08-01T00:00:00Z");
  const end = new Date("2027-06-30T23:59:59Z");
  return postedAt >= start && postedAt <= end;
}

function isUsOnsiteOrHybrid(location: string, body: string) {
  const value = `${location} ${body.slice(0, 600)}`.toLowerCase();
  if (/remote/.test(location.toLowerCase()) || /remote only/.test(value)) return false;
  const usSignal = /united states|\busa\b|\bu\.s\.|new york|san francisco|seattle|boston|chicago|austin|los angeles|palo alto|menlo park|mountain view|sunnyvale|santa clara|san jose|washington,? dc|miami|houston|dallas|atlanta|denver|california|massachusetts|texas|virginia|illinois|georgia|florida|pennsylvania|new jersey|connecticut|maryland|north carolina|oregon|washington/;
  return usSignal.test(value);
}

function normalizedCompany(company: string) { return company.toLowerCase().replace(/[🔥🛂🇺🇸]/g, "").trim(); }

function isQuantFirm(company: string) { return QUANT_FIRMS.has(normalizedCompany(company)); }

function isEngineeringAdjacent(title: string) {
  const value = title.toLowerCase();
  return /software|developer|development|quantitative dev|technology|systems|infrastructure|platform|engineering|engineer|site reliability|\bsre\b|devops|data engineer|security engineer|network engineer|cloud engineer/.test(value)
    && !/trader|trading intern|research|analyst|strategy|portfolio|risk|operations/.test(value);
}

function isExplicitQuantDeveloper(title: string) {
  return /\bquant(?:itative)?\s+(?:software\s+)?(?:dev|developer|development engineer)\b/i.test(title);
}

function classify(company: string, title: string, body: string, category?: string): RoleTrack | undefined {
  const value = `${title} ${body}`.toLowerCase();
  if (isExplicitQuantDeveloper(title)) return "quant";
  const quantEmployer = isQuantFirm(company) || category === "Quantitative Finance";
  if (quantEmployer && isEngineeringAdjacent(title)) return "quant";
  if (quantEmployer) return undefined;
  if (/machine learning|\bml\b|artificial intelligence|\bai\b|deep learning|computer vision|natural language|\bnlp\b|data scien/.test(value)
      && !/recruiter|strategy|analytics|business intelligence/.test(title.toLowerCase())) return "ml";
  if (category === "Software" || /software|developer|engineering intern|backend|frontend|full.?stack|infrastructure|systems engineer/.test(value)) return "swe";
}

function featuredGroupFor(company: string): Role["featuredGroup"] | undefined {
  const value = normalizedCompany(company);
  if (TOP_AI.has(value)) return "Top AI";
  if (ELITE_QUANT.has(value)) return "Quant";
  if (BIG_TECH.has(value)) return "Big Tech";
}

function isExcludedCompany(company: string) { return EXCLUDED_COMPANIES.has(normalizedCompany(company)); }

function isUsLocation(location: string) {
  const value = location.trim();
  if (/remote|canada|united kingdom|\buk\b|london|singapore|india|australia|ireland|germany|france|japan|china|hong kong/i.test(value)) return false;
  return /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b|\bNYC\b|\bSF\b|\bLA\b|United States|Illinois$/i.test(value);
}

function experienceFor(text: string): Experience[] {
  const value = text.toLowerCase();
  const result: Experience[] = [];
  if (/sophomore|second.year|class of 2029/.test(value)) result.push("sophomore");
  if (/junior|third.year|class of 2028/.test(value)) result.push("junior");
  if (/senior|fourth.year|class of 2027/.test(value)) result.push("senior");
  return result.length ? result : ["all-undergrad"];
}

function requirementsFrom(body: string) {
  return textOnly(body).split(/(?<=[.!?])\s+/).filter((line) => /experience|degree|enrolled|proficien|knowledge|ability|coursework/i.test(line)).slice(0, 5);
}

function deadlineFrom(job: GreenhouseJob) {
  const metadataValue = job.metadata?.find((item) => /deadline|apply by|closing date/i.test(item.name))?.value;
  const candidate = Array.isArray(metadataValue) ? metadataValue[0] : metadataValue;
  const bodyMatch = textOnly(job.content).match(/(?:application deadline|apply by|applications close)[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+2027|\d{1,2}\/\d{1,2}\/2027)/i)?.[1];
  const parsed = candidate || bodyMatch;
  if (!parsed) return undefined;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function scrapeBoard(board: string): Promise<Role[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`, {
    headers: { "User-Agent": "InternshipTracker/0.1 local personal-use" }, cache: "no-store", signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return [];
  const payload = await response.json() as { jobs?: GreenhouseJob[] };
  const roles: Role[] = [];
  for (const job of payload.jobs ?? []) {
    const body = textOnly(job.content);
    const postedAt = new Date(job.updated_at);
    const company = COMPANY_NAMES[board] ?? board.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    const track = classify(company, job.title, body);
    if (isExcludedCompany(company) || !track || !isInternship(job.title) || !isSummer2027Relevant(job.title, body, postedAt) || !isUsOnsiteOrHybrid(job.location.name, body)) continue;
    const featuredGroup = FEATURED[board] ?? featuredGroupFor(company);
    const combined = `${job.title} ${body}`;
    roles.push({
      id: idFor(job.absolute_url), company,
      title: job.title, track, location: job.location.name, workMode: /hybrid/i.test(combined) ? "hybrid" : "onsite",
      experience: experienceFor(combined), description: body.slice(0, 1800), requirements: requirementsFrom(job.content ?? ""),
      skills: extractSkills(combined), postedAt: postedAt.toISOString(), deadline: deadlineFrom(job), sourceUrl: job.absolute_url,
      source: "Greenhouse", featured: Boolean(featuredGroup), featuredGroup
    });
  }
  return roles;
}

async function scrapeSimplifyRepository(): Promise<Role[]> {
  const response = await fetch("https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json", {
    headers: { "User-Agent": "InternshipTracker/0.1 local personal-use" }, cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`SimplifyJobs GitHub returned ${response.status}`);
  const listings = await response.json() as SimplifyListing[];
  const cutoff = Date.now() - 7 * 86400000;
  const roles: Role[] = [];
  for (const listing of listings) {
    const postedAt = new Date(listing.date_posted * 1000);
    const featuredGroup = featuredGroupFor(listing.company_name);
    const degrees = listing.degrees ?? [];
    const undergraduateEligible = !degrees.length || degrees.some((degree) => /bachelor|associate/i.test(degree));
    const locations = listing.locations.filter(isUsLocation);
    const track = classify(listing.company_name, listing.title, "", listing.category);
    if (isExcludedCompany(listing.company_name) || !listing.active || !listing.is_visible || !listing.terms.includes("Summer 2027") || !undergraduateEligible || !track || !locations.length) continue;
    if (/co-?op|graduate|phd|mba|remote/i.test(`${listing.title} ${listing.url}`)) continue;
    if (postedAt.getTime() < cutoff && !featuredGroup) continue;
    const requirements = degrees.length ? [`Open to ${degrees.join(", ")} students`] : ["Undergraduate eligibility should be confirmed on the employer posting"];
    roles.push({
      id: idFor(`simplify:${listing.id}`), company: listing.company_name, title: listing.title, track,
      location: locations.join("; "), workMode: "onsite", experience: experienceFor(listing.title),
      description: `${listing.title} at ${listing.company_name}. This active Summer 2027 internship was indexed by the SimplifyJobs/Pitt CSC repository. Open the original employer posting for the full responsibilities and qualifications.`,
      requirements, skills: extractSkills(listing.title), postedAt: postedAt.toISOString(), sourceUrl: listing.url,
      source: "SimplifyJobs GitHub", featured: Boolean(featuredGroup), featuredGroup
    });
  }
  return roles;
}

async function runRoleScrape() {
  const runId = startScrape();
  try {
    const extra = (process.env.GREENHOUSE_BOARDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const boards = [...new Set([...DEFAULT_BOARDS, ...extra])];
    const batches = await Promise.allSettled([...boards.map(scrapeBoard), scrapeSimplifyRepository()]);
    const candidates = batches.flatMap((batch) => batch.status === "fulfilled" ? batch.value : []);
    const deduped = new Map<string, Role>();
    for (const role of candidates) {
      const key = `${normalizedCompany(role.company)}|${role.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${role.location.toLowerCase()}`;
      const current = deduped.get(key);
      if (!current || role.source === "SimplifyJobs GitHub") deduped.set(key, role);
    }
    const roles = [...deduped.values()];
    deactivateAllRoles();
    roles.forEach(upsertRole);
    const failed = batches.filter((batch) => batch.status === "rejected").length;
    finishScrape(runId, roles.length, "complete", failed ? `${failed} sources were unavailable` : "All sources checked");
    return { found: roles.length, checked: boards.length + 1, failed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scraper error";
    finishScrape(runId, 0, "failed", message);
    throw error;
  }
}

let activeRoleScrape: Promise<{ found: number; checked: number; failed: number }> | undefined;
export async function scrapeRoles() {
  if (activeRoleScrape) return activeRoleScrape;
  activeRoleScrape = runRoleScrape();
  try { return await activeRoleScrape; }
  finally { activeRoleScrape = undefined; }
}

export async function scrapeInterviewInsights(role: Role): Promise<InterviewInsight[]> {
  const resources: InterviewInsight[] = [
    {
      id: `${role.id}-behavioral-guide`, roleId: role.id, type: "behavioral", title: "Behavioral interview preparation",
      summary: "A structured framework for selecting stories, answering common behavioral prompts, and preparing questions for the interviewer.",
      sourceUrl: "https://www.techinterviewhandbook.org/behavioral-interview/", sourceName: "Tech Interview Handbook"
    },
    role.track === "ml" ? {
      id: `${role.id}-ml-guide`, roleId: role.id, type: "technical", title: "Machine learning interview preparation guide",
      summary: "Review common ML interview formats, foundational concepts, modeling tradeoffs, and production-oriented questions.",
      sourceUrl: "https://huyenchip.com/ml-interviews-book/", sourceName: "Introduction to Machine Learning Interviews"
    } : role.track === "quant" ? {
      id: `${role.id}-quant-dev-guide`, roleId: role.id, type: "technical", title: "Systems and coding interview preparation",
      summary: "Review coding patterns, operating systems, concurrency, networking, and performance tradeoffs for quant software engineering interviews.",
      sourceUrl: "https://www.techinterviewhandbook.org/coding-interview-study-plan/", sourceName: "Tech Interview Handbook"
    } : {
      id: `${role.id}-coding-guide`, roleId: role.id, type: "oa", title: "Software interview study plan",
      summary: "A practical data-structures, algorithms, and coding-interview study plan with topic prioritization.",
      sourceUrl: "https://www.techinterviewhandbook.org/coding-interview-study-plan/", sourceName: "Tech Interview Handbook"
    }
  ];
  resources.forEach(saveInsight);
  const query = `${role.company} ${role.track === "quant" ? "software engineer intern interview OA" : "software intern interview"}`;
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=year&limit=8`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "InternshipTracker/0.1 personal-use" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) return resources;
    const data = await response.json() as { data?: { children?: { data: { id: string; title: string; selftext?: string; permalink: string; created_utc: number } }[] } };
    const insights = (data.data?.children ?? []).map(({ data: post }): InterviewInsight => ({
      id: `reddit-${post.id}`, roleId: role.id,
      type: /oa|hackerrank|codesignal|assessment/i.test(`${post.title} ${post.selftext}`) ? "oa" : /behavior/i.test(`${post.title} ${post.selftext}`) ? "behavioral" : "technical",
      title: post.title, summary: (post.selftext || "Community discussion—open the source for details.").slice(0, 320),
      sourceUrl: `https://www.reddit.com${post.permalink}`, sourceName: "Reddit (community report)",
      publishedAt: new Date(post.created_utc * 1000).toISOString()
    }));
    insights.forEach(saveInsight);
    return [...resources, ...insights];
  } catch { return resources; }
}

let schedulerStarted = false;
const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;
export function ensureScrapeScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const last = getSetting("lastScrapeAt");
  if (!last || Date.now() - new Date(last).getTime() >= SCRAPE_INTERVAL_MS) void scrapeRoles().catch(console.error);
  setInterval(() => void scrapeRoles().catch(console.error), SCRAPE_INTERVAL_MS).unref();
}
