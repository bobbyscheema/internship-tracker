import { NextResponse } from "next/server";
import { scoreRole } from "@/lib/matching";
import { getResume, getRoles, getSetting } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const resume = getResume();
  const roles = getRoles().map((role) => ({ ...role, ...scoreRole(role, resume) }));
  return NextResponse.json({ roles, lastScrapeAt: getSetting("lastScrapeAt"), hasResume: Boolean(resume), resumeName: resume?.filename.replace(/^\d+-/, "") });
}
