import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { analyzeResumeText } from "@/lib/matching";
import type { ResumeProfile } from "@/types";

const run = promisify(execFile);

function cleanXml(value: string) {
  return value.replace(/<w:tab\/?\s*>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function saveAndParseResume(file: File): Promise<ResumeProfile> {
  const extension = path.extname(file.name).toLowerCase();
  if (![".pdf", ".docx"].includes(extension)) throw new Error("Upload a PDF or DOCX resume.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Resume must be smaller than 8 MB.");
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const target = path.join(process.cwd(), "data", "resumes", safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    if (extension === ".pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
    } else {
      await fs.writeFile(target, buffer);
      const result = await run("unzip", ["-p", target, "word/document.xml"]);
      text = cleanXml(result.stdout);
    }
    if (!text.trim()) throw new Error("No selectable text was found in the resume.");
    if (extension === ".pdf") await fs.writeFile(target, buffer);
  } catch (error) {
    if (extension === ".docx") await fs.rm(target, { force: true });
    const detail = error instanceof Error ? error.message : "Unknown parsing error";
    throw new Error(extension === ".pdf" ? `Could not read this PDF: ${detail}` : `Could not read this DOCX file: ${detail}`);
  }
  const year = text.match(/\b(2027|2028|2029|2030)\b/)?.[1];
  const locationMatches = text.match(/(?:San Francisco|New York|Seattle|Boston|Chicago|Austin|Los Angeles|San Jose|Palo Alto|Atlanta|Miami|Denver)/gi) ?? [];
  const analysis = analyzeResumeText(text);
  return {
    filename: safeName, uploadedAt: new Date().toISOString(), text: text.slice(0, 50000),
    skills: analysis.skills, graduationYear: year ? Number(year) : undefined,
    locations: [...new Set(locationMatches.map((value) => value.toLowerCase()))],
    keywords: analysis.keywords, coursework: analysis.coursework, trackSignals: analysis.trackSignals,
  };
}
