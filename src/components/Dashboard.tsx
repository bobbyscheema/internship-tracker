"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import ResumeWorkspace from "./ResumeWorkspace";
import type { InterviewInsight, Role, RoleTrack } from "@/types";

type FeedResponse = { roles: Role[]; lastScrapeAt?: string; hasResume: boolean; resumeName?: string };
type Section = "discover" | "featured" | "resume" | "alerts";
type FeaturedGroup = NonNullable<Role["featuredGroup"]>;

const TRACKS: { id: RoleTrack; label: string; subtitle: string }[] = [
  { id: "swe", label: "Software Engineering", subtitle: "Product, infra & systems" },
  { id: "ml", label: "Machine Learning", subtitle: "AI, research & applied ML" },
  { id: "quant", label: "Quant Engineering", subtitle: "SWE at quant firms" },
];

const FEATURED_GROUPS: { id: FeaturedGroup; label: string; subtitle: string; icon: string }[] = [
  { id: "Top AI", label: "Frontier AI", subtitle: "Leading model labs & AI infrastructure", icon: "✦" },
  { id: "Quant", label: "Elite Quant", subtitle: "Top-paying prop shops & systematic firms", icon: "∿" },
  { id: "Big Tech", label: "Premium Tech", subtitle: "Selective, high-comp engineering programs", icon: "⌘" },
];

function ageLabel(date: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

function CompanyMark({ company }: { company: string }) {
  const colors = ["#dedcff", "#d9f4e7", "#ffe4ce", "#dcecff", "#f9ddec"];
  const index = company.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % colors.length;
  return <div className="company-mark" style={{ background: colors[index] }}>{company.slice(0, 2).toUpperCase()}</div>;
}

export default function Dashboard() {
  const [feed, setFeed] = useState<FeedResponse>({ roles: [], hasResume: false });
  const [section, setSection] = useState<Section>("discover");
  const [track, setTrack] = useState<RoleTrack>("swe");
  const [featuredGroup, setFeaturedGroup] = useState<FeaturedGroup>("Top AI");
  const [experience, setExperience] = useState("all");
  const [location, setLocation] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "match">("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<Role>();
  const [insights, setInsights] = useState<InterviewInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [tailorRoleId, setTailorRoleId] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const response = await fetch("/api/roles", { cache: "no-store" }); setFeed(await response.json()); }
    catch { setToast("Could not load the local database."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        await fetch("/api/roles/refresh", { method: "POST" });
        if (active) await load();
      } catch { /* The next five-minute sync will retry. */ }
    };
    void sync();
    const timer = setInterval(() => void sync(), 5 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [load]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/roles/refresh", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load(); setToast(`Checked ${result.checked ?? "all"} sources · ${result.found ?? 0} matching roles found`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const uploadResume = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.append("resume", file);
    setToast("Reading your resume locally…");
    const response = await fetch("/api/resume", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) { setToast(result.error); return; }
    await load(); setSort("match"); setToast(`Resume saved · ${result.skills.length} skills detected`);
  };

  const hideViewedRole = (role: Role) => {
    setFeed((current) => ({ ...current, roles: current.roles.filter((item) => item.id !== role.id) }));
    setSelected(undefined);
    void fetch("/api/viewed", {
      method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id })
    }).catch(() => setToast("Could not hide the viewed role locally."));
  };

  const openRole = async (role: Role) => {
    setSelected(role); setInsights([]); setInsightsLoading(true);
    try { const response = await fetch(`/api/insights?roleId=${role.id}`); const result = await response.json(); setInsights(result.insights ?? []); }
    finally { setInsightsLoading(false); }
  };

  const freshCutoff = Date.now() - 7 * 86400000;
  const rolePool = useMemo(() => {
    if (section === "featured") return feed.roles.filter((role) => role.featured);
    return feed.roles.filter((role) => new Date(role.postedAt).getTime() >= freshCutoff);
  }, [feed.roles, section, freshCutoff]);

  const locations = useMemo(() => [...new Set(feed.roles.map((role) => role.location))].sort(), [feed.roles]);
  const visible = useMemo(() => rolePool.filter((role) => {
    if (section === "featured" ? role.featuredGroup !== featuredGroup : role.track !== track) return false;
    if (experience !== "all" && !role.experience.includes(experience as Role["experience"][number]) && !role.experience.includes("all-undergrad")) return false;
    if (location !== "all" && role.location !== location) return false;
    return `${role.company} ${role.title} ${role.skills.join(" ")}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => sort === "match" ? (b.matchScore ?? 0) - (a.matchScore ?? 0) : +new Date(b.postedAt) - +new Date(a.postedAt)), [rolePool, section, featuredGroup, track, experience, location, query, sort]);

  const title = section === "discover" ? "Fresh opportunities" : section === "featured" ? "The short list" : section === "resume" ? "Resume match" : "Daily alerts";

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><Icon name="radar" /></span><span>Internship<span>Radar</span></span></div>
      <div className="season-pill"><span></span> SUMMER 2027</div>
      <nav>
        <p>WORKSPACE</p>
        <button className={section === "discover" ? "active" : ""} onClick={() => setSection("discover")}><Icon name="grid" />Discover</button>
        <button className={section === "featured" ? "active" : ""} onClick={() => setSection("featured")}><Icon name="spark" />Featured</button>
        <p>TOOLS</p>
        <button className={section === "resume" ? "active" : ""} onClick={() => setSection("resume")}><Icon name="file" />Resume match</button>
        <button className={section === "alerts" ? "active" : ""} onClick={() => setSection("alerts")}><Icon name="bell" />Alerts</button>
      </nav>
      <div className="sidebar-card">
        <Icon name="spark" />
        <strong>{feed.hasResume ? "Resume matching is on" : "Find your best fit"}</strong>
        <p>{feed.hasResume ? `${feed.resumeName} is stored locally.` : "Upload your resume to rank every role for you."}</p>
        <button onClick={() => fileRef.current?.click()}>{feed.hasResume ? "Replace resume" : "Upload resume"}</button>
      </div>
      <div className="local-note"><span></span><div><strong>Local workspace</strong><small>Private · no account</small></div></div>
    </aside>

    <main>
      <header>
        <div><p>SUMMER 2027 INTERNSHIPS</p><h1>{title}</h1></div>
        <div className="header-actions">
          <div className="last-sync"><span></span><div><small>Last refreshed</small><strong>{feed.lastScrapeAt ? ageLabel(feed.lastScrapeAt) : "Not yet"}</strong></div></div>
          <button className="refresh-button" onClick={refresh} disabled={refreshing}><Icon name="refresh" className={refreshing ? "spin" : ""}/>{refreshing ? "Scanning…" : "Refresh roles"}</button>
        </div>
      </header>

      {section === "resume" ? <ResumeWorkspace hasResume={feed.hasResume} resumeName={feed.resumeName} onUpload={() => fileRef.current?.click()} roles={feed.roles} initialRoleId={tailorRoleId} notify={setToast} /> :
       section === "alerts" ? <AlertsPanel notify={setToast} /> : <>
        {section === "featured" && <section className="featured-intro"><div><span>CURATED WATCHLIST</span><h2>Prestige and pay, without the noise.</h2><p>Only highly selective companies with exceptional engineering brands or consistently top-tier intern compensation make this page.</p></div><Icon name="spark" /></section>}
        <section className="metrics">
          <div><span className="metric-icon purple"><Icon name="briefcase" /></span><div><strong>{rolePool.length}</strong><small>{section === "featured" ? "Featured roles" : "Active roles"}</small></div><em>US only</em></div>
          <div><span className="metric-icon green"><Icon name="spark" /></span><div><strong>{feed.hasResume ? feed.roles.filter((r) => (r.matchScore ?? 0) >= 70).length : "—"}</strong><small>Strong matches</small></div><em>{feed.hasResume ? "70%+ fit" : "Add resume"}</em></div>
          <div><span className="metric-icon orange"><Icon name="refresh" /></span><div><strong>5 min</strong><small>Automatic refresh</small></div><em>Always scanning</em></div>
        </section>

        <section className={`track-tabs ${section === "featured" ? "featured-tabs" : ""}`}>
          {section === "featured" ? FEATURED_GROUPS.map((item) => <button key={item.id} className={featuredGroup === item.id ? "active" : ""} onClick={() => setFeaturedGroup(item.id)}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.subtitle}</small></div><b>{rolePool.filter((role) => role.featuredGroup === item.id).length}</b></button>) : TRACKS.map((item) => <button key={item.id} className={track === item.id ? "active" : ""} onClick={() => setTrack(item.id)}><span>{item.id === "swe" ? "</>" : item.id === "ml" ? "✦" : "∿"}</span><div><strong>{item.label}</strong><small>{item.subtitle}</small></div><b>{rolePool.filter((role) => role.track === item.id).length}</b></button>)}
        </section>

        <section className="toolbar">
          <label className="search"><Icon name="search"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies, roles, or skills…" /></label>
          <select value={experience} onChange={(e) => setExperience(e.target.value)} aria-label="Experience"><option value="all">All undergrads</option><option value="sophomore">Sophomore-friendly</option><option value="junior">Junior</option><option value="senior">Senior</option></select>
          <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location"><option value="all">All US locations</option>{locations.map((loc) => <option key={loc}>{loc}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "match")} aria-label="Sort"><option value="newest">Newest first</option><option value="match" disabled={!feed.hasResume}>Best match</option></select>
        </section>

        <div className="section-heading"><div><h2>{section === "featured" ? `${FEATURED_GROUPS.find((group) => group.id === featuredGroup)?.label} internships` : `${TRACKS.find((t) => t.id === track)?.label} roles`}</h2><p>{section === "featured" ? `${FEATURED_GROUPS.find((group) => group.id === featuredGroup)?.subtitle}. Curated for compensation, selectivity, and engineering reputation.` : "Verified employer timestamps · posted within the last 7 days · opened roles disappear"}</p></div><span>{visible.length} result{visible.length === 1 ? "" : "s"}</span></div>
        <section className="role-list">
          {loading ? <LoadingRows /> : visible.length ? visible.map((role) => <RoleCard key={role.id} role={role} hasResume={feed.hasResume} onOpen={openRole} />) : <EmptyState refreshing={refreshing} onRefresh={refresh} onUpload={() => fileRef.current?.click()} />}
        </section>
      </>}
    </main>

    <input ref={fileRef} hidden type="file" accept=".pdf,.docx" onChange={(e) => { void uploadResume(e.target.files?.[0]); e.target.value = ""; }} />
    {selected && <RoleDrawer role={selected} insights={insights} loading={insightsLoading} onClose={() => setSelected(undefined)} onViewed={hideViewedRole} onTailor={(role) => { setTailorRoleId(role.id); setSection("resume"); setSelected(undefined); }} />}
    {toast && <div className="toast"><Icon name="check" />{toast}</div>}
  </div>;
}

function RoleCard({ role, hasResume, onOpen }: { role: Role; hasResume: boolean; onOpen: (r: Role) => void }) {
  return <article className="role-card" onClick={() => onOpen(role)}>
    <CompanyMark company={role.company} />
    <div className="role-main"><div className="role-title"><h3>{role.title}</h3>{role.featured && <span className="featured-badge">{role.featuredGroup}</span>}</div><strong className="company-name">{role.company}</strong><div className="role-meta"><span><Icon name="pin" />{role.location}</span><span><Icon name="briefcase" />{role.workMode}</span><span><Icon name="clock" />{ageLabel(role.postedAt)}</span>{role.deadline && <span>Apply by {new Date(role.deadline).toLocaleDateString()}</span>}</div><div className="skill-row">{role.experience.includes("sophomore") && <span className="sophomore-tag">Sophomore</span>}{role.skills.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}</div></div>
    <div className="role-side">{hasResume && role.matchScore !== undefined && <div className={`match-score ${role.matchScore >= 70 ? "strong" : ""}`}><b>{role.matchScore}%</b><small>match</small></div>}<button aria-label="View details"><Icon name="chevron" /></button></div>
  </article>;
}

function EmptyState({ refreshing, onRefresh, onUpload }: { refreshing: boolean; onRefresh: () => void; onUpload: () => void }) {
  return <div className="empty-state"><div className="empty-radar"><Icon name="radar" /></div><h3>No matching roles right now</h3><p>The tracker checks sources every 5 minutes. Roles you open are hidden permanently so this list stays focused on opportunities you have not reviewed.</p><div><button onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? "Scanning sources…" : "Check sources now"}</button><button className="secondary" onClick={onUpload}>Add resume</button></div></div>;
}

function LoadingRows() { return <>{[1, 2, 3].map((i) => <div className="role-card skeleton" key={i}><span></span><div><i></i><i></i><i></i></div></div>)}</>; }

function AlertsPanel({ notify }: { notify: (value: string) => void }) {
  type Form = { enabled: boolean; provider: "gmail" | "outlook" | "yahoo" | "custom"; recipient: string; username: string; password: string; hasPassword: boolean; host: string; port: number; secure: boolean; frequency: "15m" | "1h" | "6h" | "daily"; dailyHour: number };
  const [form, setForm] = useState<Form>({ enabled: false, provider: "gmail", recipient: "", username: "", password: "", hasPassword: false, host: "smtp.gmail.com", port: 465, secure: true, frequency: "1h", dailyHour: 8 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((settings) => setForm((current) => ({ ...current, ...settings }))).finally(() => setLoading(false)); }, []);
  const payload = () => {
    const { hasPassword, ...settings } = form;
    void hasPassword;
    return { ...settings, password: form.password || undefined };
  };
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setForm((current) => ({ ...current, hasPassword: result.hasPassword, password: "" })); notify("Email alert settings saved");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save settings"); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setForm((current) => ({ ...current, hasPassword: true, password: "" })); notify("Test email sent—check your inbox");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not send test email"); }
    finally { setTesting(false); }
  };
  const sendDigest = async () => {
    setSendingDigest(true);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), mode: "digest" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setForm((current) => ({ ...current, hasPassword: true, password: "" }));
      notify(result.sent ? `Digest sent with ${result.roleCount} role${result.roleCount === 1 ? "" : "s"}` : "No new unviewed roles to email");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not send digest"); }
    finally { setSendingDigest(false); }
  };
  const update = <K extends keyof Form,>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  if (loading) return <section className="tool-page"><div className="alert-form loading-panel">Loading email settings…</div></section>;
  return <section className="tool-page alert-page">
    <div className="alert-intro"><span><Icon name="bell" /></span><div><p>ROLE DROP ALERTS</p><h2>Get new internships in your inbox.</h2><span>Everything is configured here and saved only on this computer.</span></div><label className="toggle"><input type="checkbox" checked={form.enabled} onChange={(e) => update("enabled", e.target.checked)} /><i></i><b>{form.enabled ? "Enabled" : "Paused"}</b></label></div>
    <div className="alert-grid">
      <form className="alert-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="form-section"><div><b>01</b><span><strong>Inbox</strong><small>Where alerts should arrive</small></span></div><label>Recipient email<input type="email" required value={form.recipient} onChange={(e) => update("recipient", e.target.value)} placeholder="you@example.com" /></label></div>
        <div className="form-section"><div><b>02</b><span><strong>Sending account</strong><small>Use an app password from your email provider</small></span></div><div className="provider-row">{(["gmail", "outlook", "yahoo", "custom"] as const).map((provider) => <button type="button" className={form.provider === provider ? "active" : ""} onClick={() => update("provider", provider)} key={provider}>{provider === "custom" ? "Custom" : provider[0].toUpperCase() + provider.slice(1)}</button>)}</div><div className="form-columns"><label>Sending email<input type="email" required value={form.username} onChange={(e) => update("username", e.target.value)} placeholder="sender@gmail.com" /></label><label>App password<input type="password" required={!form.hasPassword} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={form.hasPassword ? "Saved—leave blank to keep" : "Enter app password"} /></label></div>{form.provider === "custom" && <div className="form-columns custom-smtp"><label>SMTP host<input required value={form.host} onChange={(e) => update("host", e.target.value)} placeholder="smtp.example.com" /></label><label>Port<input type="number" required value={form.port} onChange={(e) => update("port", Number(e.target.value))} /></label><label className="secure-check"><input type="checkbox" checked={form.secure} onChange={(e) => update("secure", e.target.checked)} />Use direct TLS</label></div>}<p className="form-help">For Gmail, Yahoo, or accounts with two-factor authentication, create an app password in your provider&apos;s security settings. Your password remains in the local gitignored database.</p></div>
        <div className="form-section"><div><b>03</b><span><strong>Frequency</strong><small>How quickly you want new drops</small></span></div><div className="frequency-row">{([{"id":"15m","label":"15 min"},{"id":"1h","label":"Hourly"},{"id":"6h","label":"Every 6h"},{"id":"daily","label":"Daily"}] as const).map((item) => <button type="button" className={form.frequency === item.id ? "active" : ""} onClick={() => update("frequency", item.id)} key={item.id}>{item.label}</button>)}</div>{form.frequency === "daily" && <label className="daily-time">Delivery hour<select value={form.dailyHour} onChange={(e) => update("dailyHour", Number(e.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{new Date(2020, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}</option>)}</select></label>}</div>
        <div className="form-actions"><button type="button" className="test-button" onClick={() => void test()} disabled={testing || saving || sendingDigest}>{testing ? "Sending…" : "Test connection"}</button><button type="button" className="test-button" onClick={() => void sendDigest()} disabled={testing || saving || sendingDigest}>{sendingDigest ? "Sending digest…" : "Send digest now"}</button><button className="save-button" type="submit" disabled={saving || testing || sendingDigest}><Icon name="check" />{saving ? "Saving…" : "Save settings"}</button></div>
      </form>
      <aside className="alert-summary"><p>YOUR ALERT PLAN</p><h3>{form.enabled ? "Radar is watching." : "Alerts are paused."}</h3><div><span><Icon name="bell" /></span><p><b>{form.frequency === "15m" ? "Every 15 minutes" : form.frequency === "1h" ? "Every hour" : form.frequency === "6h" ? "Every 6 hours" : `Daily at ${new Date(2020, 0, 1, form.dailyHour).toLocaleTimeString([], { hour: "numeric" })}`}</b><small>Each newly discovered, unviewed role is delivered once</small></p></div><div><span><Icon name="file" /></span><p><b>{form.recipient || "No recipient yet"}</b><small>Detailed role summary, requirements, keywords, match context, and direct link</small></p></div><div><span><Icon name="spark" /></span><p><b>Local and private</b><small>No account or external alert service</small></p></div><footer>The local app must be running for scheduled emails to send.</footer></aside>
    </div>
  </section>;
}

function RoleDrawer({ role, insights, loading, onClose, onViewed, onTailor }: { role: Role; insights: InterviewInsight[]; loading: boolean; onClose: () => void; onViewed: (r: Role) => void; onTailor: (r: Role) => void }) {
  const advice = role.track === "quant" ? ["Expect data structures, algorithms, and performance-minded coding.", "Review concurrency, networking, operating systems, and C++ or Python when listed.", "Practice explaining correctness and latency tradeoffs before optimizing."] : role.track === "ml" ? ["Be ready to connect model choices to evaluation metrics.", "Review core ML theory plus production-minded coding.", "Prepare one project story covering data, tradeoffs, and results."] : ["Practice medium-level data structures and algorithms under time pressure.", "Prepare concise stories for ownership, conflict, and learning quickly.", "Know the technical decisions behind every project on your resume."];
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}><button className="drawer-close" onClick={onClose}><Icon name="close" /></button><div className="drawer-top"><CompanyMark company={role.company}/><div><span>{role.track.toUpperCase()} · SUMMER 2027</span><h2>{role.title}</h2><p>{role.company} · {role.location}</p></div>{role.matchScore !== undefined && <div className="drawer-score"><b>{role.matchScore}%</b><small>match</small></div>}</div><div className="drawer-actions with-tailor"><button onClick={() => onTailor(role)}><Icon name="spark" />Tailor resume with AI</button><a href={role.sourceUrl} target="_blank" rel="noreferrer" onClick={() => onViewed(role)}>View original posting · hide from feed <Icon name="arrow" /></a></div>{role.matchReasons?.length ? <section><h3>Why it fits</h3><ul className="fit-list">{role.matchReasons.map((reason) => <li key={reason}><Icon name="check" />{reason}</li>)}</ul></section> : null}<section><h3>Role snapshot</h3><p className="description">{role.description || "Open the original posting for the complete role description."}</p><div className="skill-row">{role.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section><section><h3>Interview playbook</h3><div className="advice-list">{advice.map((item, i) => <div key={item}><b>0{i + 1}</b><p>{item}</p></div>)}</div></section><section><div className="insight-title"><div><h3>Community reports</h3><p>Company and role-family level · verify dates and details</p></div></div>{loading ? <div className="insight-loading">Searching recent community discussions…</div> : insights.length ? insights.map((item) => <a className="insight" href={item.sourceUrl} target="_blank" rel="noreferrer" key={item.id}><span>{item.type}</span><div><strong>{item.title}</strong><p>{item.summary}</p><small>{item.sourceName}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString()}` : ""}</small></div><Icon name="arrow" /></a>) : <div className="mini-empty">No recent community reports found. Try searching Reddit, LeetCode Discuss, and Glassdoor using the company and role title.</div>}</section></aside></div>;
}
