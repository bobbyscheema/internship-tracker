import { NextResponse } from "next/server";
import { EVENT_DIRECTORIES } from "@/lib/events";
import { getRecruitingEvents, getSetting } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    events: getRecruitingEvents(), directories: EVENT_DIRECTORIES, lastScrapeAt: getSetting("lastEventScrapeAt"),
    aiEnabled: Boolean(process.env.OPENAI_API_KEY || getSetting("openaiApiKey")),
  });
}
