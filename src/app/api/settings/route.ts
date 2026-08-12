import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  return NextResponse.json({ emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.ALERT_EMAIL_TO), alertTo: process.env.ALERT_EMAIL_TO ? process.env.ALERT_EMAIL_TO.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : undefined });
}

export async function POST() {
  try {
    await sendEmail("Internship Radar alerts are ready", "<h2>You're set.</h2><p>Your daily Summer 2027 internship digest is configured correctly.</p>");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send email" }, { status: 400 });
  }
}
