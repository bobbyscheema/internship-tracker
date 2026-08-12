import { NextResponse } from "next/server";
import { getInsights, getRole } from "@/lib/store";
import { scrapeInterviewInsights } from "@/lib/scraper";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const roleId = new URL(request.url).searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId is required" }, { status: 400 });
  const role = getRole(roleId);
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  let insights = getInsights(roleId);
  if (!insights.length) {
    await scrapeInterviewInsights(role);
    insights = getInsights(roleId);
  }
  return NextResponse.json({ insights });
}
