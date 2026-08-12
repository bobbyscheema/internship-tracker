import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { InterviewInsight, ResumeProfile, Role } from "@/types";

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
  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY, role_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
    summary TEXT NOT NULL, source_url TEXT NOT NULL, source_name TEXT NOT NULL, published_at TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS scrape_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
    found INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, message TEXT
  );
`);

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

export function markRoleViewed(roleId: string) {
  db.prepare(`INSERT OR IGNORE INTO viewed_roles(role_id,viewed_at) VALUES(?,?)`).run(roleId, new Date().toISOString());
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
