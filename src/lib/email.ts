import nodemailer from "nodemailer";
import { getRoles, getSetting, setSetting } from "@/lib/store";

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

export async function sendEmail(subject: string, html: string, override?: EmailAlertSettings) {
  const settings = override ?? getEmailSettings();
  if (!settings.username || !settings.password || !settings.recipient) throw new Error("Finish email setup in Alerts first.");
  await transportFor(settings).sendMail({
    from: `Internship Radar <${settings.username}>`, to: settings.recipient, subject, html,
  });
}

export async function sendTestEmail(settings = getEmailSettings()) {
  await sendEmail("Internship Radar alerts are ready", "<h2>You're all set.</h2><p>New Summer 2027 roles will arrive using the frequency selected in your dashboard.</p>", settings);
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

export async function sendRoleDigest() {
  const settings = getEmailSettings();
  if (!settings.enabled) return;
  const since = getSetting("lastDigestAt") ?? new Date(Date.now() - FREQUENCY_MS[settings.frequency]).toISOString();
  const roles = getRoles().filter((role) => role.postedAt > since);
  const deadlines = getRoles().filter((role) => role.deadline && new Date(role.deadline).getTime() - Date.now() < 3 * 86400000 && new Date(role.deadline).getTime() > Date.now());
  if (!roles.length && !deadlines.length) { setSetting("lastDigestAt", new Date().toISOString()); return; }
  const list = roles.map((r) => `<li style="margin-bottom:10px"><a href="${r.sourceUrl}"><strong>${r.company} — ${r.title}</strong></a><br>${r.location} · ${r.track.toUpperCase()}</li>`).join("");
  const due = deadlines.map((r) => `<li>${r.company} — ${r.title}: ${new Date(r.deadline!).toLocaleDateString()}</li>`).join("");
  await sendEmail(`${roles.length} new Summer 2027 role${roles.length === 1 ? "" : "s"}`, `<div style="font-family:Arial,sans-serif;max-width:620px"><h2>New internship drops</h2><ul>${list || "<li>No new roles</li>"}</ul>${due ? `<h2>Deadlines soon</h2><ul>${due}</ul>` : ""}</div>`, settings);
  setSetting("lastDigestAt", new Date().toISOString());
}

let emailTimerStarted = false;
export function ensureEmailScheduler() {
  if (emailTimerStarted) return;
  emailTimerStarted = true;
  const check = () => { const settings = getEmailSettings(); if (digestIsDue(settings)) void sendRoleDigest().catch(console.error); };
  check();
  setInterval(check, 60_000).unref();
}
