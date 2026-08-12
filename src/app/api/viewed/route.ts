import { NextResponse } from "next/server";
import { markRoleViewed } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json() as { roleId?: string };
  if (!body.roleId) return NextResponse.json({ error: "A role is required." }, { status: 400 });
  markRoleViewed(body.roleId);
  return NextResponse.json({ ok: true });
}
