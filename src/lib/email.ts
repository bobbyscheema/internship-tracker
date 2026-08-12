import tls from "node:tls";
import { getRoles, getSetting, setSetting } from "@/lib/store";

function readReply(socket: tls.TLSSocket) {
  return new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => { const value = chunk.toString(); if (/^[245]\d\d[ -]/m.test(value)) { cleanup(); resolve(value); } };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); };
    socket.on("data", onData); socket.on("error", onError);
  });
}

async function command(socket: tls.TLSSocket, value: string, expected: number[]) {
  socket.write(`${value}\r\n`);
  const reply = await readReply(socket);
  const code = Number(reply.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP error ${code}`);
}

export async function sendEmail(subject: string, html: string) {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, password = process.env.SMTP_PASSWORD;
  const to = process.env.ALERT_EMAIL_TO;
  if (!host || !user || !password || !to) throw new Error("Complete the SMTP settings in .env.local first.");
  const port = Number(process.env.SMTP_PORT || 465);
  const socket = tls.connect({ host, port, servername: host });
  await new Promise<void>((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  await readReply(socket);
  await command(socket, `EHLO localhost`, [250]);
  await command(socket, "AUTH LOGIN", [334]);
  await command(socket, Buffer.from(user).toString("base64"), [334]);
  await command(socket, Buffer.from(password).toString("base64"), [235]);
  await command(socket, `MAIL FROM:<${user}>`, [250]);
  await command(socket, `RCPT TO:<${to}>`, [250, 251]);
  await command(socket, "DATA", [354]);
  const message = `From: Internship Radar <${user}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html.replace(/\r?\n\./g, "\r\n..")}\r\n.`;
  await command(socket, message, [250]);
  await command(socket, "QUIT", [221]);
  socket.end();
}

export async function sendDailyDigest() {
  const since = getSetting("lastDigestAt") ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const roles = getRoles().filter((role) => role.postedAt > since);
  const deadlines = getRoles().filter((role) => role.deadline && new Date(role.deadline).getTime() - Date.now() < 3 * 86400000 && new Date(role.deadline).getTime() > Date.now());
  if (!roles.length && !deadlines.length) return;
  const list = roles.map((r) => `<li><a href="${r.sourceUrl}">${r.company} — ${r.title}</a> · ${r.location}</li>`).join("");
  const due = deadlines.map((r) => `<li>${r.company} — ${r.title}: ${r.deadline}</li>`).join("");
  await sendEmail(`${roles.length} new Summer 2027 internship${roles.length === 1 ? "" : "s"}`, `<h2>New roles</h2><ul>${list || "<li>No new roles</li>"}</ul><h2>Deadlines soon</h2><ul>${due || "<li>None</li>"}</ul>`);
  setSetting("lastDigestAt", new Date().toISOString());
}

let emailTimerStarted = false;
export function ensureEmailScheduler() {
  if (emailTimerStarted) return;
  emailTimerStarted = true;
  setInterval(() => {
    const hour = Number(process.env.ALERT_HOUR || 8);
    const last = getSetting("lastDigestAt");
    if (new Date().getHours() === hour && (!last || new Date(last).toDateString() !== new Date().toDateString())) void sendDailyDigest().catch(console.error);
  }, 30 * 60 * 1000).unref();
}
