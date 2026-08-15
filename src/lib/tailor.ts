import { getResume, getRole, getSetting, setSetting } from "@/lib/store";
import type { TailoredResume } from "@/types";

const MODEL = "gpt-5.6-luna";

const schema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    reorderedSkills: { type: "array", items: { type: "string" } },
    atsKeywords: { type: "array", items: { type: "string" } },
    bulletRewrites: { type: "array", items: { type: "object", properties: { original: { type: "string" }, tailored: { type: "string" }, why: { type: "string" } }, required: ["original", "tailored", "why"], additionalProperties: false } },
    projectRewrites: { type: "array", items: { type: "object", properties: { original: { type: "string" }, tailored: { type: "string" }, why: { type: "string" } }, required: ["original", "tailored", "why"], additionalProperties: false } },
    gapAnalysis: { type: "array", items: { type: "string" } },
    integrityNotes: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "summary", "reorderedSkills", "atsKeywords", "bulletRewrites", "projectRewrites", "gapAnalysis", "integrityNotes"],
  additionalProperties: false,
};

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as { content?: { type?: string; text?: string; refusal?: string }[] }[]) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal") throw new Error(content.refusal || "The model declined this request.");
    }
  }
  throw new Error("The AI response did not contain a tailored resume.");
}

export function getTailorStatus() {
  const saved = getSetting("lastTailoredResume");
  return { hasApiKey: Boolean(process.env.OPENAI_API_KEY || getSetting("openaiApiKey")), lastResult: saved ? JSON.parse(saved) as TailoredResume : null, model: MODEL };
}

export async function tailorResume(roleId: string, suppliedKey?: string): Promise<TailoredResume> {
  const role = getRole(roleId);
  const resume = getResume();
  if (!resume) throw new Error("Upload a resume before using AI tailoring.");
  if (!role) throw new Error("That role is no longer available in your feed.");
  const cleanKey = suppliedKey?.trim();
  if (cleanKey) setSetting("openaiApiKey", cleanKey);
  const apiKey = cleanKey || process.env.OPENAI_API_KEY || getSetting("openaiApiKey");
  if (!apiKey) throw new Error("Add an OpenAI API key to generate a tailored resume.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 5000,
      input: [
        { role: "system", content: "You are a meticulous technical resume editor. Tailor a student's existing resume to one internship. Preserve factual integrity: never invent a technology, metric, responsibility, employer, date, award, or outcome. Reorder only skills explicitly evidenced in the resume. Keep bullets concise, action-led, ATS-readable, and faithful to the original. Put missing job qualifications only in gapAnalysis, never into rewritten resume content. If a metric is absent, improve specificity without making one up." },
        { role: "user", content: `TARGET ROLE\nCompany: ${role.company}\nTitle: ${role.title}\nTrack: ${role.track}\nLocation: ${role.location}\nDescription: ${role.description}\nRequirements: ${role.requirements.join(" | ")}\nKeywords: ${role.skills.join(", ")}\n\nCURRENT RESUME\n${resume.text}` },
      ],
      text: { format: { type: "json_schema", name: "tailored_resume", strict: true, schema } },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error as { message?: string } | undefined;
    throw new Error(apiError?.message || `OpenAI request failed (${response.status}).`);
  }
  const generated = JSON.parse(responseText(payload)) as Omit<TailoredResume, "roleId" | "generatedAt" | "company" | "roleTitle">;
  const result: TailoredResume = { roleId, generatedAt: new Date().toISOString(), company: role.company, roleTitle: role.title, ...generated };
  setSetting("lastTailoredResume", JSON.stringify(result));
  return result;
}
