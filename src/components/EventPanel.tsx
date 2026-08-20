"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import type { RecruitingEvent } from "@/types";

type Directory = { company: string; label: string; url: string };
type Response = { events: RecruitingEvent[]; directories: Directory[]; lastScrapeAt?: string; aiEnabled?: boolean };

function dateParts(value: string) {
  const date = new Date(value);
  return { month: date.toLocaleDateString([], { month: "short" }).toUpperCase(), day: date.getDate(), date };
}

function timeRange(event: RecruitingEvent) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : undefined;
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return end ? `${time} – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : time;
}

function daysUntil(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

export default function EventPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Response>({ events: [], directories: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [format, setFormat] = useState("all");
  const [category, setCategory] = useState("all");
  const [apiKey, setApiKey] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/events", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load recruiting events");
    setData(await response.json());
  }, []);
  useEffect(() => { void load().catch(() => notify("Could not load recruiting events")).finally(() => setLoading(false)); }, [load, notify]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/events/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey.trim() || undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load(); setApiKey(""); notify(`Checked ${result.checked} event sources · ${result.found} worthwhile upcoming events found${result.failed ? ` · ${result.failed} source failed` : ""}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Event refresh failed"); }
    finally { setRefreshing(false); }
  };
  const companies = useMemo(() => [...new Set(data.events.map((event) => event.company))].sort(), [data.events]);
  const visible = useMemo(() => data.events.filter((event) => {
    if (company !== "all" && event.company !== company) return false;
    if (format !== "all" && event.format !== format) return false;
    if (category !== "all" && event.category !== category) return false;
    return `${event.company} ${event.title} ${event.description} ${event.location}`.toLowerCase().includes(query.toLowerCase());
  }), [data.events, company, format, category, query]);
  const virtual = data.events.filter((event) => event.format === "virtual").length;
  const thisMonth = data.events.filter((event) => { const date = new Date(event.startAt); const now = new Date(); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }).length;

  return <section className="events-page">
    <div className="events-hero"><div><span>HOURLY RECRUITING RADAR</span><h2>Meet the companies before you apply.</h2><p>High-value student recruiting sessions, engineering talks, recruiter Q&amp;As, workshops, career fairs, and hiring hackathons found through official calendars and AI-assisted web discovery.</p><small>{data.lastScrapeAt ? `Last checked ${new Date(data.lastScrapeAt).toLocaleString()}` : "First hourly scan pending"}</small></div><button onClick={() => void refresh()} disabled={refreshing}><Icon name="refresh" className={refreshing ? "spin" : ""}/>{refreshing ? "Searching the web…" : "Search now"}</button></div>
    {!data.aiEnabled && <div className="event-ai-setup"><Icon name="spark"/><div><strong>Enable hourly AI web discovery</strong><p>Add your OpenAI API key once. It stays in the local database and is also reused by Resume Match.</p></div><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…"/><button disabled={!apiKey.trim() || refreshing} onClick={() => void refresh()}>Save &amp; search</button></div>}
    <div className="event-metrics"><div><strong>{data.events.length}</strong><span>Upcoming events</span></div><div><strong>{thisMonth}</strong><span>This month</span></div><div><strong>{virtual}</strong><span>Virtual</span></div><div><strong>{data.aiEnabled ? "On" : "Setup"}</strong><span>Hourly AI search</span></div><div><strong>{data.directories.length}</strong><span>Official calendars</span></div></div>
    <div className="event-toolbar"><label><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, companies, or locations…" /></label><select value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">All companies</option>{companies.map((item) => <option key={item}>{item}</option>)}</select><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option><option value="virtual">Virtual</option><option value="in-person">In person</option><option value="hybrid">Hybrid</option></select><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All event types</option><option value="info-session">Info sessions</option><option value="tech-talk">Tech talks</option><option value="workshop">Workshops</option><option value="hackathon">Hackathons</option><option value="career-fair">Career fairs</option><option value="conference">Conferences</option><option value="other">Other</option></select></div>
    <div className="section-heading"><div><h2>Worth registering for</h2><p>Only future, student-relevant events with open registration · dates use your local timezone</p></div><span>{visible.length} event{visible.length === 1 ? "" : "s"}</span></div>
    <div className="event-list">{loading ? <div className="event-empty">Searching company calendars…</div> : visible.length ? visible.map((event) => { const parts = dateParts(event.startAt); return <article className="event-card" key={event.id}><div className="event-date"><span>{parts.month}</span><strong>{parts.day}</strong></div><div className="event-body"><div><span className={`event-format ${event.format}`}>{event.format}</span><span className="event-category">{event.category.replace("-", " ")}</span><em>{daysUntil(event.startAt)}</em></div><h3>{event.title}</h3><strong>{event.company}</strong><p>{event.description}</p><div className="event-meta"><span><Icon name="clock"/>{timeRange(event)}</span><span><Icon name="pin"/>{event.location}</span><span><Icon name="file"/>{event.audience}</span>{event.registrationDeadline && <span className="event-deadline"><Icon name="bell"/>Register by {new Date(event.registrationDeadline).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</span>}</div></div><a href={event.registrationUrl} target="_blank" rel="noreferrer">View &amp; register <Icon name="arrow"/></a></article>; }) : <div className="event-empty"><Icon name="calendar"/><h3>No worthwhile open events found right now.</h3><p>The radar checks hourly. Add an API key for broad web discovery, or open an official company calendar below.</p></div>}</div>
    <div className="event-sources"><div className="section-heading"><div><h2>Official event calendars</h2><p>Open a live company directory when registration details are rendered behind sign-in or JavaScript</p></div></div><div>{data.directories.map((directory) => <a href={directory.url} target="_blank" rel="noreferrer" key={directory.url}><span>{directory.company.slice(0, 2).toUpperCase()}</span><p><strong>{directory.company}</strong><small>{directory.label}</small></p><Icon name="arrow"/></a>)}</div></div>
  </section>;
}
