import { NextResponse } from "next/server";
import { getTailorStatus, tailorResume } from "@/lib/tailor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getTailorStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { roleId?: string; apiKey?: string };
    if (!body.roleId) return NextResponse.json({ error: "Choose a target role first." }, { status: 400 });
    const result = await tailorResume(body.roleId, body.apiKey);
    return NextResponse.json({ result, hasApiKey: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not tailor this resume." }, { status: 400 });
  }
}
