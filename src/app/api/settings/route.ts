import { NextResponse } from "next/server";
import { getEmailSettings, saveEmailSettings, sendRoleDigest, sendTestEmail, type EmailAlertSettings } from "@/lib/email";
import { getSetting } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const settings = getEmailSettings();
  const digestStatus = getSetting("lastDigestStatus");
  return NextResponse.json({
    enabled: settings.enabled, provider: settings.provider, recipient: settings.recipient,
    username: settings.username, hasPassword: Boolean(settings.password), host: settings.host,
    port: settings.port, secure: settings.secure, frequency: settings.frequency, dailyHour: settings.dailyHour,
    lastDigestStatus: digestStatus ? JSON.parse(digestStatus) : null,
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
    const body = await request.json() as Partial<EmailAlertSettings> & { mode?: "test" | "digest" };
    const { mode, ...input } = body;
    const settings = saveEmailSettings(input);
    if (mode === "digest") {
      const result = await sendRoleDigest();
      return NextResponse.json({ ok: true, ...result });
    }
    await sendTestEmail(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send email" }, { status: 400 });
  }
}
