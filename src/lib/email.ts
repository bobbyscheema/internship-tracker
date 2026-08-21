import nodemailer from "nodemailer";
import { scoreRole } from "@/lib/matching";
import { getEmailedRoleIds, getResume, getRoles, getSetting, markRolesEmailed, setSetting } from "@/lib/store";
import type { Role } from "@/types";

export type AlertFrequency = "15m" | "1h" | "6h" | "daily";
export type EmailProvider = "gmail" | "outlook" | "yahoo" | "custom";

export interface EmailAlertSettings {
  enabled: boolean;
  provider: EmailProvider;
  recipient: string;
  username: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  frequency: AlertFrequency;
  dailyHour: number;
}

const PROVIDERS: Record<Exclude<EmailProvider, "custom">, Pick<EmailAlertSettings, "host" | "port" | "secure">> = {
  gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { host: "smtp-mail.outlook.com", port: 587, secure: false },
  yahoo: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
};

const DEFAULTS: EmailAlertSettings = {
  enabled: false, provider: "gmail", recipient: "", username: "", password: "",
  host: "smtp.gmail.com", port: 465, secure: true, frequency: "1h", dailyHour: 8,
};

export function getEmailSettings(): EmailAlertSettings {
  const stored = getSetting("emailAlertSettings");
  if (!stored) return DEFAULTS;
  try { return { ...DEFAULTS, ...JSON.parse(stored) as Partial<EmailAlertSettings> }; }
  catch { return DEFAULTS; }
}

export function saveEmailSettings(input: Partial<EmailAlertSettings>) {
  const current = getEmailSettings();
  const provider = input.provider ?? current.provider;
  const preset = provider === "custom" ? {} : PROVIDERS[provider];
  const next: EmailAlertSettings = {
    ...current, ...input, ...preset, provider,
    recipient: String(input.recipient ?? current.recipient).trim(),
    username: String(input.username ?? current.username).trim(),
    password: input.password ? String(input.password) : current.password,
    dailyHour: Math.min(23, Math.max(0, Number(input.dailyHour ?? current.dailyHour))),
    port: Number((preset as { port?: number }).port ?? input.port ?? current.port),
  };
  if (!next.recipient || !/^\S+@\S+\.\S+$/.test(next.recipient)) throw new Error("Enter a valid recipient email.");
  if (!next.username || !next.password) throw new Error("Enter the sending email and its app password.");
  if (!next.host || !next.port) throw new Error("Enter valid SMTP server settings.");
  setSetting("emailAlertSettings", JSON.stringify(next));
  if (!getSetting("lastDigestAt")) setSetting("lastDigestAt", new Date().toISOString());
  return next;
}

function transportFor(settings: EmailAlertSettings) {
  return nodemailer.createTransport({
    host: settings.host, port: settings.port, secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    connectionTimeout: 12_000, greetingTimeout: 12_000, socketTimeout: 20_000,
  });
}

export async function sendEmail(subject: string, html: string, override?: EmailAlertSettings, plainText?: string) {
  const settings = override ?? getEmailSettings();
  if (!settings.username || !settings.password || !settings.recipient) throw new Error("Finish email setup in Alerts first.");
  await transportFor(settings).sendMail({
    from: `Internship Radar <${settings.username}>`, to: settings.recipient, subject, html, text: plainText,
  });
}

export async function sendTestEmail(settings = getEmailSettings()) {
  await sendEmail("Internship Radar alerts are ready", "<h2>You're all set.</h2><p>New Summer 2027 roles will arrive using the frequency selected in your dashboard.</p>", settings, "You're all set. New Summer 2027 roles will arrive using the frequency selected in your dashboard.");
}

const FREQUENCY_MS: Record<AlertFrequency, number> = {
  "15m": 15 * 60_000, "1h": 60 * 60_000, "6h": 6 * 60 * 60_000, daily: 24 * 60 * 60_000,
};

function digestIsDue(settings: EmailAlertSettings, now = new Date()) {
  if (!settings.enabled) return false;
  const lastValue = getSetting("lastDigestAt");
  const last = lastValue ? new Date(lastValue).getTime() : 0;
  if (settings.frequency === "daily") {
    return now.getHours() >= settings.dailyHour && (!lastValue || new Date(last).toDateString() !== now.toDateString());
  }
  return now.getTime() - last >= FREQUENCY_MS[settings.frequency];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);

function conciseSummary(role: Role) {
  const clean = role.description.replace(/\s+/g, " ").trim();
  if (!clean) return "Open the original posting for the complete role description.";
  const sentences = clean.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ").trim() ?? clean;
  return sentences.length > 420 ? `${sentences.slice(0, 417).trimEnd()}…` : sentences;
}

function roleCard(role: Role) {
  const requirements = role.requirements.slice(0, 3);
  const match = role.matchScore !== undefined
    ? `<div style="margin:12px 0 0;padding:10px 12px;background:#f3f0ff;border-radius:8px;color:#4e3fc0"><strong>${role.matchScore}% resume match</strong>${role.matchReasons?.length ? `<br><span style="color:#6e6689;font-size:13px">${escapeHtml(role.matchReasons.slice(0, 2).join(" · "))}</span>` : ""}</div>`
    : "";
  return `<article style="border:1px solid #e8e5ec;border-radius:12px;padding:20px;margin:0 0 14px;background:#fff">
    <div style="color:#6957de;font-size:11px;font-weight:700;letter-spacing:.8px">${escapeHtml(role.track.toUpperCase())} · SUMMER 2027${role.featured ? " · FEATURED" : ""}</div>
    <h2 style="font-size:19px;line-height:1.3;margin:6px 0 2px;color:#27232d">${escapeHtml(role.title)}</h2>
    <div style="font-weight:700;color:#4b4652">${escapeHtml(role.company)}</div>
    <div style="font-size:13px;color:#77717e;margin:7px 0 15px">${escapeHtml(role.location)} · ${escapeHtml(role.workMode)} · Posted ${new Date(role.postedAt).toLocaleDateString()}${role.deadline ? ` · Apply by ${new Date(role.deadline).toLocaleDateString()}` : ""}</div>
    <p style="font-size:14px;line-height:1.55;color:#514c58;margin:0 0 12px">${escapeHtml(conciseSummary(role))}</p>
    ${requirements.length ? `<div style="font-size:13px;color:#514c58"><strong>What they are looking for</strong><ul style="padding-left:19px;margin:7px 0 12px">${requirements.map((item) => `<li style="margin-bottom:4px">${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    ${role.skills.length ? `<div style="font-size:12px;color:#706a77;margin-bottom:14px"><strong>Keywords:</strong> ${escapeHtml(role.skills.slice(0, 8).join(" · "))}</div>` : ""}
    ${match}
    <a href="${escapeHtml(role.sourceUrl)}" style="display:inline-block;margin-top:15px;background:#6957de;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 15px;border-radius:8px">View original posting →</a>
    <div style="font-size:11px;color:#99939e;margin-top:10px">Source: ${escapeHtml(role.source)}</div>
  </article>`;
}

function plainRole(role: Role) {
  const lines = [
    `${role.company} — ${role.title}`,
    `${role.track.toUpperCase()} | ${role.location} | ${role.workMode} | Posted ${new Date(role.postedAt).toLocaleDateString()}`,
    conciseSummary(role),
  ];
  if (role.requirements.length) lines.push(`What they are looking for: ${role.requirements.slice(0, 3).join("; ")}`);
  if (role.skills.length) lines.push(`Keywords: ${role.skills.slice(0, 8).join(", ")}`);
  if (role.matchScore !== undefined) lines.push(`Resume match: ${role.matchScore}%${role.matchReasons?.length ? ` — ${role.matchReasons.slice(0, 2).join("; ")}` : ""}`);
  lines.push(role.sourceUrl);
  return lines.join("\n");
}

export interface DigestResult { sent: boolean; roleCount: number; }

export async function sendRoleDigest(): Promise<DigestResult> {
  const settings = getEmailSettings();
  if (!settings.enabled) return { sent: false, roleCount: 0 };
  const emailed = getEmailedRoleIds();
  const resume = getResume();
  const roles = getRoles()
    .filter((role) => !emailed.has(role.id))
    .map((role) => ({ ...role, ...scoreRole(role, resume) }));
  if (!roles.length) {
    setSetting("lastDigestAt", new Date().toISOString());
    setSetting("lastDigestStatus", JSON.stringify({ status: "no-new-roles", at: new Date().toISOString(), roleCount: 0 }));
    return { sent: false, roleCount: 0 };
  }
  const trackCounts = roles.reduce<Record<string, number>>((counts, role) => ({ ...counts, [role.track]: (counts[role.track] ?? 0) + 1 }), {});
  const breakdown = ["swe", "ml", "quant"].filter((track) => trackCounts[track]).map((track) => `${trackCounts[track]} ${track.toUpperCase()}`).join(" · ");
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;background:#faf9fb;padding:24px;color:#27232d">
    <div style="background:#24212c;color:#fff;border-radius:13px;padding:24px;margin-bottom:16px"><div style="font-size:11px;letter-spacing:1.2px;color:#a999ff;font-weight:700">INTERNSHIP RADAR</div><h1 style="font-size:25px;margin:7px 0">${roles.length} new Summer 2027 role${roles.length === 1 ? "" : "s"}</h1><p style="color:#bbb6c2;margin:0;font-size:14px">${breakdown} · US internships discovered by your local tracker</p></div>
    ${roles.map(roleCard).join("")}
    <p style="font-size:11px;color:#8b8590;text-align:center;line-height:1.5">You receive each unviewed role once. Opening its original posting removes it from your feed.</p>
  </div>`;
  const plainText = `INTERNSHIP RADAR\n${roles.length} new Summer 2027 role${roles.length === 1 ? "" : "s"}\n${breakdown}\n\n${roles.map(plainRole).join("\n\n---\n\n")}`;
  await sendEmail(`${roles.length} new Summer 2027 role${roles.length === 1 ? "" : "s"} — ${breakdown}`, html, settings, plainText);
  markRolesEmailed(roles.map((role) => role.id));
  setSetting("lastDigestAt", new Date().toISOString());
  setSetting("lastDigestStatus", JSON.stringify({ status: "sent", at: new Date().toISOString(), roleCount: roles.length }));
  return { sent: true, roleCount: roles.length };
}

let emailTimerStarted = false;
export function ensureEmailScheduler() {
  if (emailTimerStarted) return;
  emailTimerStarted = true;
  const check = () => { const settings = getEmailSettings(); if (digestIsDue(settings)) void sendRoleDigest().catch((error) => {
    console.error(error);
    setSetting("lastDigestStatus", JSON.stringify({ status: "error", at: new Date().toISOString(), message: error instanceof Error ? error.message : "Unknown email error" }));
  }); };
  check();
  setInterval(check, 60_000).unref();
}
