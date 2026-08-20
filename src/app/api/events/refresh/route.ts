import { NextResponse } from "next/server";
import { scrapeEvents } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try { return NextResponse.json(await scrapeEvents()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Event refresh failed" }, { status: 500 }); }
}
