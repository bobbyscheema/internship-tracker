import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { InterviewInsight, RecruitingEvent, ResumeProfile, Role } from "@/types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(path.join(dataDir, "resumes"), { recursive: true });

const globalStore = globalThis as typeof globalThis & { __internDb?: DatabaseSync };
const db = globalStore.__internDb ?? new DatabaseSync(path.join(dataDir, "internships.db"));
if (process.env.NODE_ENV !== "production") globalStore.__internDb = db;

db.exec(`PRAGMA busy_timeout = 10000;`);
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL, track TEXT NOT NULL,
    location TEXT NOT NULL, work_mode TEXT NOT NULL, experience TEXT NOT NULL,
    description TEXT NOT NULL, requirements TEXT NOT NULL, skills TEXT NOT NULL,
    posted_at TEXT NOT NULL, deadline TEXT, source_url TEXT UNIQUE NOT NULL, source TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0, featured_group TEXT, active INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS viewed_roles (
    role_id TEXT PRIMARY KEY, viewed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS emailed_roles (
    role_id TEXT PRIMARY KEY, emailed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY, role_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
    summary TEXT NOT NULL, source_url TEXT NOT NULL, source_name TEXT NOT NULL, published_at TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS scrape_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
    found INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, message TEXT
  );
  CREATE TABLE IF NOT EXISTS role_enrichments (
    source_url TEXT PRIMARY KEY, description TEXT NOT NULL, requirements TEXT NOT NULL,
    skills TEXT NOT NULL, successful INTEGER NOT NULL, fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recruiting_events (
    id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
    start_at TEXT NOT NULL, end_at TEXT, registration_deadline TEXT, location TEXT NOT NULL, format TEXT NOT NULL,
    category TEXT NOT NULL, audience TEXT NOT NULL, registration_url TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS emailed_events (
    event_id TEXT PRIMARY KEY, emailed_at TEXT NOT NULL
  );
`);
try { db.exec(`ALTER TABLE recruiting_events ADD COLUMN registration_deadline TEXT`); } catch { /* Existing databases already migrated. */ }

const json = <T>(value: string): T => JSON.parse(value) as T;

export function upsertRole(role: Role) {
  db.prepare(`INSERT INTO roles (id,company,title,track,location,work_mode,experience,description,requirements,skills,posted_at,deadline,source_url,source,featured,featured_group,last_seen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_url) DO UPDATE SET
    company=excluded.company,title=excluded.title,track=excluded.track,location=excluded.location,
    work_mode=excluded.work_mode,experience=excluded.experience,description=excluded.description,
    requirements=excluded.requirements,skills=excluded.skills,posted_at=excluded.posted_at,
    deadline=excluded.deadline,featured=excluded.featured,featured_group=excluded.featured_group,
    active=1,last_seen_at=excluded.last_seen_at`).run(
      role.id, role.company, role.title, role.track, role.location, role.workMode,
      JSON.stringify(role.experience), role.description, JSON.stringify(role.requirements),
      JSON.stringify(role.skills), role.postedAt, role.deadline ?? null, role.sourceUrl,
      role.source, role.featured ? 1 : 0, role.featuredGroup ?? null, new Date().toISOString()
    );
}

export function deactivateAllRoles() {
  db.prepare(`UPDATE roles SET active=0`).run();
}

export function getRoles(): Role[] {
  const rows = db.prepare(`SELECT r.* FROM roles r LEFT JOIN viewed_roles v ON v.role_id=r.id WHERE active=1 AND v.role_id IS NULL ORDER BY posted_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id), company: String(r.company), title: String(r.title), track: r.track as Role["track"],
    location: String(r.location), workMode: r.work_mode as Role["workMode"],
    experience: json(String(r.experience)), description: String(r.description), requirements: json(String(r.requirements)),
    skills: json(String(r.skills)), postedAt: String(r.posted_at), deadline: r.deadline ? String(r.deadline) : undefined,
    sourceUrl: String(r.source_url), source: String(r.source), featured: Boolean(r.featured),
    featuredGroup: r.featured_group as Role["featuredGroup"],
  }));
}

export function getRole(id: string) { return getRoles().find((role) => role.id === id); }

export interface RoleEnrichment { description: string; requirements: string[]; skills: string[]; successful: boolean; fetchedAt: string; }
export function getRoleEnrichment(sourceUrl: string): RoleEnrichment | undefined {
  const row = db.prepare(`SELECT description,requirements,skills,successful,fetched_at FROM role_enrichments WHERE source_url=?`).get(sourceUrl) as Record<string, unknown> | undefined;
  return row ? { description: String(row.description), requirements: json(String(row.requirements)), skills: json(String(row.skills)), successful: Boolean(row.successful), fetchedAt: String(row.fetched_at) } : undefined;
}
export function saveRoleEnrichment(sourceUrl: string, enrichment: Omit<RoleEnrichment, "fetchedAt">) {
  db.prepare(`INSERT INTO role_enrichments(source_url,description,requirements,skills,successful,fetched_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_url) DO UPDATE SET description=excluded.description,requirements=excluded.requirements,skills=excluded.skills,successful=excluded.successful,fetched_at=excluded.fetched_at`)
    .run(sourceUrl, enrichment.description, JSON.stringify(enrichment.requirements), JSON.stringify(enrichment.skills), enrichment.successful ? 1 : 0, new Date().toISOString());
}

export function deactivateEventsBySource(sourceName: string) {
  db.prepare(`UPDATE recruiting_events SET active=0 WHERE source_name=?`).run(sourceName);
}

export function upsertRecruitingEvent(event: RecruitingEvent) {
  db.prepare(`INSERT INTO recruiting_events(id,company,title,description,start_at,end_at,registration_deadline,location,format,category,audience,registration_url,source_name,active,last_seen_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(registration_url) DO UPDATE SET company=excluded.company,title=excluded.title,
    description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,registration_deadline=excluded.registration_deadline,location=excluded.location,format=excluded.format,
    category=excluded.category,audience=excluded.audience,source_name=excluded.source_name,active=1,last_seen_at=excluded.last_seen_at`).run(
      event.id, event.company, event.title, event.description, event.startAt, event.endAt ?? null, event.registrationDeadline ?? null, event.location,
      event.format, event.category, event.audience, event.registrationUrl, event.sourceName, new Date().toISOString()
    );
}

export function getRecruitingEvents(): RecruitingEvent[] {
  const now = new Date();
  const rows = db.prepare(`SELECT * FROM recruiting_events WHERE active=1 AND COALESCE(end_at,start_at)>=? AND (registration_deadline IS NULL OR registration_deadline>=?) ORDER BY start_at ASC`)
    .all(new Date(now.getTime() - 4 * 60 * 60_000).toISOString(), now.toISOString()) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id), company: String(row.company), title: String(row.title), description: String(row.description),
    startAt: String(row.start_at), endAt: row.end_at ? String(row.end_at) : undefined,
    registrationDeadline: row.registration_deadline ? String(row.registration_deadline) : undefined, location: String(row.location),
    format: row.format as RecruitingEvent["format"], category: row.category as RecruitingEvent["category"],
    audience: String(row.audience), registrationUrl: String(row.registration_url), sourceName: String(row.source_name),
  }));
}

export function getEmailedEventIds() {
  const rows = db.prepare(`SELECT event_id FROM emailed_events`).all() as { event_id: string }[];
  return new Set(rows.map((row) => row.event_id));
}

export function markEventsEmailed(eventIds: string[]) {
  if (!eventIds.length) return;
  const statement = db.prepare(`INSERT OR IGNORE INTO emailed_events(event_id,emailed_at) VALUES(?,?)`);
  const emailedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const eventId of eventIds) statement.run(eventId, emailedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markRoleViewed(roleId: string) {
  db.prepare(`INSERT OR IGNORE INTO viewed_roles(role_id,viewed_at) VALUES(?,?)`).run(roleId, new Date().toISOString());
}

export function getEmailedRoleIds() {
  const rows = db.prepare(`SELECT role_id FROM emailed_roles`).all() as { role_id: string }[];
  return new Set(rows.map((row) => row.role_id));
}

export function markRolesEmailed(roleIds: string[]) {
  if (!roleIds.length) return;
  const statement = db.prepare(`INSERT OR IGNORE INTO emailed_roles(role_id,emailed_at) VALUES(?,?)`);
  const emailedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const roleId of roleIds) statement.run(roleId, emailedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function saveInsight(insight: InterviewInsight) {
  db.prepare(`INSERT OR IGNORE INTO insights(id,role_id,type,title,summary,source_url,source_name,published_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(insight.id, insight.roleId, insight.type, insight.title, insight.summary, insight.sourceUrl, insight.sourceName, insight.publishedAt ?? null);
}

export function getInsights(roleId: string): InterviewInsight[] {
  return db.prepare(`SELECT id,role_id as roleId,type,title,summary,source_url as sourceUrl,source_name as sourceName,published_at as publishedAt FROM insights WHERE role_id=? ORDER BY published_at DESC`).all(roleId) as unknown as InterviewInsight[];
}

export function setSetting(key: string, value: string) {
  db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
export function getSetting(key: string) { return (db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined)?.value; }

export function saveResume(profile: ResumeProfile) { setSetting("resumeProfile", JSON.stringify(profile)); }
export function getResume(): ResumeProfile | undefined { const value = getSetting("resumeProfile"); return value ? json(value) : undefined; }

export function startScrape() {
  const result = db.prepare(`INSERT INTO scrape_runs(started_at,status) VALUES(?,?)`).run(new Date().toISOString(), "running");
  return Number(result.lastInsertRowid);
}
export function finishScrape(id: number, found: number, status: string, message = "") {
  db.prepare(`UPDATE scrape_runs SET finished_at=?,found=?,status=?,message=? WHERE id=?`).run(new Date().toISOString(), found, status, message, id);
  setSetting("lastScrapeAt", new Date().toISOString());
}

export { db };
