import { NextResponse } from "next/server";
import { getEmailSettings, saveEmailSettings, sendTestEmail, type EmailAlertSettings } from "@/lib/email";

export const runtime = "nodejs";

export async function GET() {
  const settings = getEmailSettings();
  return NextResponse.json({
    enabled: settings.enabled, provider: settings.provider, recipient: settings.recipient,
    username: settings.username, hasPassword: Boolean(settings.password), host: settings.host,
    port: settings.port, secure: settings.secure, frequency: settings.frequency, dailyHour: settings.dailyHour,
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Partial<EmailAlertSettings>;
    const saved = saveEmailSettings(body);
    return NextResponse.json({ ok: true, enabled: saved.enabled, hasPassword: Boolean(saved.password) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save alert settings" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<EmailAlertSettings>;
    const settings = saveEmailSettings(body);
    await sendTestEmail(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send email" }, { status: 400 });
  }
}
