import crypto from "node:crypto";
import { deactivateEventsBySource, getSetting, setSetting, upsertRecruitingEvent } from "@/lib/store";
import type { RecruitingEvent } from "@/types";

export const EVENT_DIRECTORIES = [
  { company: "NVIDIA", label: "University recruiting", url: "https://www.nvidia.com/en-us/about-nvidia/careers/university-recruiting/events-calendar/" },
  { company: "Microsoft", label: "Early-career virtual events", url: "https://careers.microsoft.com/v2/global/en/virtualevents" },
  { company: "Google", label: "Careers OnAir", url: "https://careersonair.withgoogle.com/" },
  { company: "JPMorganChase", label: "Student events", url: "https://careers.jpmorgan.com/us/en/students/events" },
  { company: "GitHub", label: "Education events", url: "https://education.github.com/events" },
] as const;

const OPPORTUNITY_SOURCE = {
  company: "Student opportunity trackers", label: "Underclassmen opportunities",
  url: "https://raw.githubusercontent.com/Jose-Gael-Cruz-Lopez/underclassmen-opportunities/main/README.md",
};

const AI_SOURCE_NAME = "AI web discovery";
const MODEL = "gpt-5.6-luna";

export const EVENT_SEARCH_PROMPT = `Search the web for newly announced or upcoming high-value software engineering, AI/ML, systems, GPU/computer architecture, and quant developer recruiting events for college students, especially Summer 2027 internship candidates.

Prioritize company-specific university recruiting events, sophomore programs, engineering webinars, recruiter Q&As, technical workshops, career fairs, and early-talent programs from major technology, aerospace, quantitative trading/finance, and engineering companies.

Return only worthwhile events that are still open for registration and that a US undergraduate can attend, including virtual events available in the US. Exclude generic job pages, recordings, broad non-technical conferences, expired registration pages, graduate-only events, and ordinary social events. Every result must have a verifiable future date/time and a direct registration or official event link. Include the company, event name, start date/time with timezone, end time when known, registration deadline when available, location/virtual format, intended audience, a concise reason it is valuable, and the registration link. If a fact is unavailable, leave only that optional field null rather than guessing.`;

const aiEventSchema = {
  type: "object",
  properties: {
    events: { type: "array", items: { type: "object", properties: {
      company: { type: "string" }, title: { type: "string" }, description: { type: "string" },
      startAt: { type: "string" }, endAt: { type: ["string", "null"] }, registrationDeadline: { type: ["string", "null"] },
      location: { type: "string" }, format: { type: "string", enum: ["virtual", "in-person", "hybrid"] },
      category: { type: "string", enum: ["info-session", "career-fair", "hackathon", "tech-talk", "workshop", "conference", "other"] },
      audience: { type: "string" }, registrationUrl: { type: "string" },
    }, required: ["company", "title", "description", "startAt", "endAt", "registrationDeadline", "location", "format", "category", "audience", "registrationUrl"], additionalProperties: false } },
  }, required: ["events"], additionalProperties: false,
};

const idFor = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
const textOnly = (html = "") => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

function categoryFor(value: string): RecruitingEvent["category"] {
  if (/hackathon|code for good|coding challenge/i.test(value)) return "hackathon";
  if (/career fair|expo|conference|convention/i.test(value)) return /conference|convention/i.test(value) ? "conference" : "career-fair";
  if (/tech talk|engineer talk|developer talk/i.test(value)) return "tech-talk";
  if (/workshop|resume|interview prep|coding session/i.test(value)) return "workshop";
  if (/info session|recruit|early career|university/i.test(value)) return "info-session";
  return "other";
}

function formatFor(location: string): RecruitingEvent["format"] {
  if (/virtual|online|teams|zoom|remote/i.test(location)) return "virtual";
  if (/hybrid/i.test(location)) return "hybrid";
  return "in-person";
}

function isRelevantEvent(event: RecruitingEvent) {
  const content = `${event.title} ${event.description} ${event.audience}`;
  const relevant = /student|undergrad|university|early career|recruit|career fair|intern|software|engineer|developer|coding|hackathon|code for good|tech talk|technical workshop|interview|resume/i.test(content);
  const outsideUS = /\b(uganda|india|canada|united kingdom|australia|singapore|germany|france|spain|italy|brazil|mexico|nigeria|kenya|japan|china|hong kong|taiwan|philippines|indonesia|malaysia|pakistan|bangladesh)\b/i.test(event.location);
  return relevant && (event.format !== "in-person" || !outsideUS);
}

function validDate(value: unknown) {
  if (typeof value === "number") return new Date(value * (value < 10_000_000_000 ? 1000 : 1));
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function eventFromObject(value: Record<string, unknown>, company: string, sourceName: string, fallbackUrl: string): RecruitingEvent | undefined {
  const title = textOnly(String(value.name ?? value.title ?? ""));
  const start = validDate(value.startDate ?? value.startTimestamp);
  if (!title || !start || start.getTime() < Date.now() - 4 * 60 * 60_000) return;
  const locationValue = value.location;
  const address = typeof locationValue === "string" ? locationValue : locationValue && typeof locationValue === "object"
    ? String((locationValue as Record<string, unknown>).name ?? ((locationValue as Record<string, unknown>).address as Record<string, unknown> | undefined)?.streetAddress ?? "") : "";
  const location = textOnly(String(value.completeVenue ?? value.address ?? address ?? "")) || (String(value.eventLocationType ?? "").includes("virtual") ? "Virtual" : "See event page");
  const registrationUrl = String(value.url ?? value.eventLandingURL ?? fallbackUrl);
  if (!/^https:\/\//.test(registrationUrl)) return;
  const description = textOnly(String(value.description ?? "Open the registration page for the complete event agenda and eligibility details.")).slice(0, 700);
  const end = validDate(value.endDate ?? value.endTimestamp);
  const organizer = value.organizer && typeof value.organizer === "object" ? textOnly(String((value.organizer as Record<string, unknown>).name ?? "")) : "";
  const eventCompany = organizer && organizer.length <= 80 ? organizer : company;
  return { id: idFor(`${eventCompany}:${title}:${start.toISOString()}`), company: eventCompany, title, description, startAt: start.toISOString(), endAt: end?.toISOString(), location,
    format: formatFor(`${location} ${value.eventLocationType ?? ""}`), category: categoryFor(`${title} ${description}`), audience: /student|university|intern|undergrad/i.test(`${title} ${description}`) ? "Students and early career" : "Open audience — confirm eligibility", registrationUrl, sourceName };
}

function collectEventObjects(value: unknown, output: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) value.forEach((item) => collectEventObjects(item, output));
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const type = object["@type"];
    if (type === "Event" || (Array.isArray(type) && type.includes("Event"))) output.push(object);
    Object.values(object).forEach((item) => collectEventObjects(item, output));
  }
  return output;
}

function eventsFromHtml(html: string, company: string, sourceName: string, fallbackUrl: string) {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectEventObjects(JSON.parse(match[1]), objects); } catch { /* Ignore malformed publisher metadata. */ }
  }
  for (const match of html.matchAll(/"eventData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"landingJson"/g)) {
    try { objects.push(JSON.parse(match[1])); } catch { /* Eightfold page shape changed. */ }
  }
  return objects.map((object) => eventFromObject(object, company, sourceName, fallbackUrl)).filter((event): event is RecruitingEvent => Boolean(event)).filter(isRelevantEvent);
}

async function fetchText(url: string, timeout = 12_000) {
  const response = await fetch(url, { headers: { "User-Agent": "InternshipRadar/0.1 local personal-use", Accept: "text/html,text/plain" }, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

async function scrapeOfficialDirectory(source: typeof EVENT_DIRECTORIES[number]) {
  const html = await fetchText(source.url);
  const events = eventsFromHtml(html, source.company, source.label, source.url);
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => {
    try { return new URL(match[1], source.url).href; } catch { return ""; }
  }).filter((url) => /^https:\/\//.test(url) && /event|conference|career.?fair|candidate\/landing/i.test(url) && url !== source.url);
  const uniqueLinks = [...new Set(links)].slice(0, 24);
  for (let index = 0; index < uniqueLinks.length; index += 6) {
    const pages = await Promise.allSettled(uniqueLinks.slice(index, index + 6).map(async (url) => ({ url, html: await fetchText(url, 7000) })));
    for (const page of pages) if (page.status === "fulfilled") events.push(...eventsFromHtml(page.value.html, source.company, source.label, page.value.url));
  }
  return [...new Map(events.map((event) => [event.registrationUrl, event])).values()];
}

function parseOpportunityEvents(markdown: string): RecruitingEvent[] {
  const events: RecruitingEvent[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.includes("|") || !/event\s*:/i.test(line)) continue;
    const dateText = line.match(/Event\s*:\s*([A-Z][a-z]+\s+\d{1,2}(?:\s*[–-]\s*\d{1,2})?,?\s+202[67])/i)?.[1];
    if (!dateText) continue;
    const normalizedDate = dateText.replace(/\s*[–-]\s*\d{1,2}/, "");
    const start = new Date(normalizedDate);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() - 4 * 60 * 60_000) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const company = cells[1]?.replace(/[*_🔥✅\[\]]/g, "").trim() || "Company event";
    const titleCell = cells[2] ?? line;
    const title = titleCell.replace(/\[[^\]]+\]\([^\)]+\)/g, (match) => match.replace(/^\[|\]\([^\)]+\)$/g, "")).replace(/—\s*Deadline:[\s\S]*/i, "").trim();
    const url = [...line.matchAll(/\]\((https:\/\/[^\)]+)\)/g)].map((match) => match[1]).find((link) => !/img\.shields|github\.com\/.*#/.test(link));
    if (!url || !title) continue;
    const location = cells.find((cell) => /virtual|remote|,\s*[A-Z]{2}\b|multiple locations/i.test(cell)) ?? "See event page";
    events.push({ id: idFor(`${company}:${title}:${start.toISOString()}`), company, title, description: `Upcoming student recruiting or technology event tracked by the underclassmen opportunities community. Confirm eligibility and final timing on the registration page.`, startAt: start.toISOString(), location, format: formatFor(location), category: categoryFor(title), audience: "Undergraduate students — confirm eligibility", registrationUrl: url, sourceName: OPPORTUNITY_SOURCE.label });
  }
  return events.filter(isRelevantEvent);
}

async function scrapeOpportunityTracker() { return parseOpportunityEvents(await fetchText(OPPORTUNITY_SOURCE.url, 15_000)); }

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as { content?: { type?: string; text?: string; refusal?: string }[] }[]) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal") throw new Error(content.refusal || "The model declined the event search.");
    }
  }
  throw new Error("The AI event search returned no structured results.");
}

async function scrapeAiWeb(apiKey: string): Promise<RecruitingEvent[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: MODEL, store: false, reasoning: { effort: "low" }, max_output_tokens: 8000,
      tools: [{ type: "web_search_preview", search_context_size: "high", user_location: { type: "approximate", country: "US", timezone: "America/Los_Angeles" } }],
      input: `${EVENT_SEARCH_PROMPT}\n\nToday is ${new Date().toISOString()}. Search broadly, favor official company and university sources, and return at most 30 events.`,
      text: { format: { type: "json_schema", name: "recruiting_events", strict: true, schema: aiEventSchema } },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error as { message?: string } | undefined;
    throw new Error(apiError?.message || `OpenAI event search failed (${response.status}).`);
  }
  const parsed = JSON.parse(responseText(payload)) as { events: Array<Omit<RecruitingEvent, "id" | "sourceName"> & { endAt: string | null; registrationDeadline: string | null }> };
  return parsed.events.flatMap((value) => {
    const start = validDate(value.startAt);
    const deadline = validDate(value.registrationDeadline ?? undefined);
    if (!start || start.getTime() < Date.now() - 4 * 60 * 60_000 || (deadline && deadline.getTime() < Date.now())) return [];
    if (!/^https:\/\//.test(value.registrationUrl)) return [];
    const event: RecruitingEvent = {
      ...value, id: idFor(`${value.company}:${value.title}:${start.toISOString()}`), startAt: start.toISOString(),
      endAt: validDate(value.endAt ?? undefined)?.toISOString(), registrationDeadline: deadline?.toISOString(), sourceName: AI_SOURCE_NAME,
    };
    return isRelevantEvent(event) ? [event] : [];
  });
}

let activeScrape: Promise<{ found: number; checked: number; failed: number; aiEnabled: boolean }> | undefined;
async function runEventScrape(suppliedKey?: string) {
  const cleanKey = suppliedKey?.trim();
  if (cleanKey) setSetting("openaiApiKey", cleanKey);
  const apiKey = cleanKey || process.env.OPENAI_API_KEY || getSetting("openaiApiKey");
  const sources = [...EVENT_DIRECTORIES.map((source) => ({ name: source.label, run: () => scrapeOfficialDirectory(source) })), { name: OPPORTUNITY_SOURCE.label, run: scrapeOpportunityTracker }];
  if (apiKey) sources.push({ name: AI_SOURCE_NAME, run: () => scrapeAiWeb(apiKey) });
  const results = await Promise.allSettled(sources.map((source) => source.run()));
  let found = 0;
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    deactivateEventsBySource(sources[index].name);
    result.value.forEach(upsertRecruitingEvent);
    found += result.value.length;
  });
  setSetting("lastEventScrapeAt", new Date().toISOString());
  return { found, checked: sources.length, failed: results.filter((result) => result.status === "rejected").length, aiEnabled: Boolean(apiKey) };
}

export async function scrapeEvents(apiKey?: string) {
  if (activeScrape) return activeScrape;
  activeScrape = runEventScrape(apiKey);
  try { return await activeScrape; } finally { activeScrape = undefined; }
}

let schedulerStarted = false;
const EVENT_REFRESH_MS = 60 * 60_000;
export function ensureEventScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const last = getSetting("lastEventScrapeAt");
  const check = async () => {
    await scrapeEvents();
    const { sendEventDigest } = await import("@/lib/email");
    await sendEventDigest();
  };
  const elapsed = last ? Date.now() - new Date(last).getTime() : EVENT_REFRESH_MS;
  const delay = Math.max(0, EVENT_REFRESH_MS - elapsed);
  setTimeout(() => {
    void check().catch(console.error);
    setInterval(() => void check().catch(console.error), EVENT_REFRESH_MS).unref();
  }, delay).unref();
}
