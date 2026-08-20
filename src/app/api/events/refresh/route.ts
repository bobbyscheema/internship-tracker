import { NextResponse } from "next/server";
import { scrapeEvents } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) as { apiKey?: string } : {};
    return NextResponse.json(await scrapeEvents(body.apiKey));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Event refresh failed" }, { status: 500 }); }
}
