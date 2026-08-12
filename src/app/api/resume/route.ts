import { NextResponse } from "next/server";
import { getResume, saveResume } from "@/lib/store";
import { saveAndParseResume } from "@/lib/resume";

export const runtime = "nodejs";

export async function GET() {
  const resume = getResume();
  return NextResponse.json(resume ? { filename: resume.filename.replace(/^\d+-/, ""), uploadedAt: resume.uploadedAt, skills: resume.skills, graduationYear: resume.graduationYear } : null);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a resume first." }, { status: 400 });
    const profile = await saveAndParseResume(file);
    saveResume(profile);
    return NextResponse.json({ filename: file.name, skills: profile.skills, graduationYear: profile.graduationYear });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
