import { NextResponse } from "next/server";
import { scrapeRoles } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

let running: Promise<unknown> | undefined;
export async function POST() {
  if (running) return NextResponse.json({ message: "A refresh is already running." }, { status: 202 });
  try {
    running = scrapeRoles();
    const result = await running;
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refresh failed" }, { status: 500 });
  } finally { running = undefined; }
}
