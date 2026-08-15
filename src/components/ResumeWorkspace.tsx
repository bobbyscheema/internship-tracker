"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import type { Role, TailoredResume } from "@/types";

type Props = {
  hasResume: boolean;
  resumeName?: string;
  onUpload: () => void;
  roles: Role[];
  initialRoleId?: string;
  notify: (message: string) => void;
};

const dimensions = [
  { key: "skillFit", label: "Skills", max: 40 },
  { key: "trackFit", label: "Role alignment", max: 18 },
  { key: "eligibilityFit", label: "Eligibility", max: 20 },
  { key: "evidenceFit", label: "Resume evidence", max: 17 },
  { key: "locationFit", label: "Location", max: 7 },
] as const;

function resultText(result: TailoredResume) {
  return [
    `${result.headline}\n${result.summary}`,
    `SKILLS\n${result.reorderedSkills.join(" · ")}`,
    result.bulletRewrites.length ? `EXPERIENCE BULLETS\n${result.bulletRewrites.map((item) => `• ${item.tailored}`).join("\n")}` : "",
    result.projectRewrites.length ? `PROJECT BULLETS\n${result.projectRewrites.map((item) => `• ${item.tailored}`).join("\n")}` : "",
    `ATS KEYWORDS\n${result.atsKeywords.join(" · ")}`,
  ].filter(Boolean).join("\n\n");
}

export default function ResumeWorkspace({ hasResume, resumeName, onUpload, roles, initialRoleId, notify }: Props) {
  const ranked = useMemo(() => [...roles].filter((role) => role.matchScore !== undefined).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)), [roles]);
  const [roleId, setRoleId] = useState(initialRoleId || ranked[0]?.id || "");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [result, setResult] = useState<TailoredResume | null>(null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => { if (initialRoleId) setRoleId(initialRoleId); }, [initialRoleId]);
  useEffect(() => {
    fetch("/api/resume/tailor", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      setHasApiKey(Boolean(data.hasApiKey));
      if (data.lastResult) setResult(data.lastResult);
    }).catch(() => undefined);
  }, []);
  const selected = roles.find((role) => role.id === roleId) ?? ranked[0];

  const generate = async () => {
    if (!selected) return notify("Choose a role to tailor toward");
    setGenerating(true);
    try {
      const response = await fetch("/api/resume/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selected.id, apiKey: apiKey || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data.result); setHasApiKey(true); setApiKey(""); notify(`Tailored resume ready for ${selected.company}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not tailor resume"); }
    finally { setGenerating(false); }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(resultText(result));
    notify("Tailored resume copied");
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([resultText(result)], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${result.company}-${result.roleTitle}-tailored.txt`.replace(/[^a-z0-9.-]+/gi, "-"); anchor.click(); URL.revokeObjectURL(url);
  };

  if (!hasResume) return <section className="tool-page"><div className="tool-hero"><span><Icon name="file" /></span><p>PRIVATE & LOCAL ANALYSIS</p><h2>Find the roles that fit you best.</h2><p>Upload your PDF or DOCX to analyze skills, coursework, project evidence, graduation timing, role alignment, and ATS keywords. Your original stays in the local gitignored data folder.</p><button onClick={onUpload}><Icon name="upload" />Upload resume</button></div></section>;

  return <section className="resume-workspace">
    <div className="resume-overview">
      <div><span className="eyebrow">RESUME INTELLIGENCE</span><h2>Your fit, with better signals.</h2><p>Matching now weighs skill coverage, related technologies, track relevance, undergraduate eligibility, quantified evidence, and location—not just exact keywords.</p><div className="resume-file"><Icon name="file" /><span><strong>{resumeName}</strong><small>Stored locally · analyzed automatically</small></span><button onClick={onUpload}>Replace</button></div></div>
      <div className="resume-stat"><strong>{ranked[0]?.matchScore ?? "—"}<small>%</small></strong><span>Top current match</span><p>{ranked[0] ? `${ranked[0].company} · ${ranked[0].title}` : "Waiting for eligible roles"}</p></div>
    </div>

    <div className="resume-grid">
      <div className="analyzer-column">
        <div className="panel-heading"><div><span>01</span><h3>Best-fit analyzer</h3></div><p>Your highest-ranked current opportunities</p></div>
        <div className="match-cards">{ranked.slice(0, 5).map((role, index) => <button key={role.id} className={selected?.id === role.id ? "active" : ""} onClick={() => setRoleId(role.id)}><b>0{index + 1}</b><span><strong>{role.title}</strong><small>{role.company} · {role.location}</small></span><em>{role.matchScore}%</em></button>)}</div>
        {selected?.matchDetails && <div className="fit-anatomy"><div className="panel-heading"><div><span>02</span><h3>Fit anatomy</h3></div><p>{selected.company} · {selected.title}</p></div>{dimensions.map((dimension) => { const value = selected.matchDetails![dimension.key]; return <div className="fit-bar" key={dimension.key}><span>{dimension.label}</span><i><b style={{ width: `${Math.min(100, value / dimension.max * 100)}%` }} /></i><em>{value}/{dimension.max}</em></div>; })}<div className="skill-evidence"><div><strong>Evidence found</strong><p>{selected.matchDetails.matchedSkills.length ? selected.matchDetails.matchedSkills.join(" · ") : "General engineering and undergraduate alignment"}</p></div><div><strong>Gaps to address honestly</strong><p>{selected.matchDetails.missingSkills.length ? selected.matchDetails.missingSkills.join(" · ") : selected.matchDetails.matchedSkills.length ? "No major keyword gaps detected" : "The employer page does not expose enough technical detail for a high-confidence skill comparison"}</p></div></div></div>}
      </div>

      <div className="tailor-column">
        <div className="panel-heading"><div><span>AI</span><h3>Resume tailor</h3></div><p>Personalize for one role</p></div>
        <div className="tailor-config"><label>Target role<select value={selected?.id ?? ""} onChange={(event) => setRoleId(event.target.value)}>{ranked.map((role) => <option value={role.id} key={role.id}>{role.company} — {role.title}</option>)}</select></label>{!hasApiKey && <label>OpenAI API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" /><small>Saved only in your local gitignored database.</small></label>}<div className="ai-privacy"><Icon name="spark" /><p><strong>Truth-preserving AI</strong><small>Your resume is sent to OpenAI only when you click generate. The tool rewords and reorders existing evidence; missing skills stay in a separate gap list.</small></p></div><button className="generate-button" onClick={() => void generate()} disabled={generating || (!hasApiKey && !apiKey)}><Icon name="spark" />{generating ? "Analyzing and rewriting…" : result ? "Generate a new version" : "Tailor with AI"}</button></div>
      </div>
    </div>

    {result && <div className="tailored-result">
      <div className="result-header"><div><span>TAILORED DRAFT</span><h3>{result.company} · {result.roleTitle}</h3><p>Generated {new Date(result.generatedAt).toLocaleString()}</p></div><div><button onClick={() => void copy()}>Copy all</button><button className="primary" onClick={download}>Download .txt</button></div></div>
      <section><span>PROFILE</span><h4>{result.headline}</h4><p>{result.summary}</p></section>
      <section><span>REORDERED SKILLS</span><div className="result-skills">{result.reorderedSkills.map((skill) => <b key={skill}>{skill}</b>)}</div></section>
      {result.bulletRewrites.length > 0 && <section><span>EXPERIENCE REWRITES</span>{result.bulletRewrites.map((item, index) => <div className="rewrite" key={`${item.original}-${index}`}><p className="before">{item.original}</p><p className="after">{item.tailored}</p><small>{item.why}</small></div>)}</section>}
      {result.projectRewrites.length > 0 && <section><span>PROJECT REWRITES</span>{result.projectRewrites.map((item, index) => <div className="rewrite" key={`${item.original}-${index}`}><p className="before">{item.original}</p><p className="after">{item.tailored}</p><small>{item.why}</small></div>)}</section>}
      <div className="result-columns"><section><span>ATS KEYWORDS USED</span><p>{result.atsKeywords.join(" · ")}</p></section><section><span>SKILLS TO BUILD — DO NOT ADD YET</span><ul>{result.gapAnalysis.map((gap) => <li key={gap}>{gap}</li>)}</ul></section></div>
      {result.integrityNotes.length > 0 && <footer><strong>Integrity check</strong> · {result.integrityNotes.join(" · ")}</footer>}
    </div>}
  </section>;
}
