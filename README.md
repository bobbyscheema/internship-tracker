# Internship Radar

A polished, local-first tracker for **US-based, onsite/hybrid Summer 2027 undergraduate internships** across software engineering, machine learning, and quantitative roles.

## Included

- Separate SWE, ML, and Quant Engineering feeds (software, quantitative developer, systems, infrastructure, data, reliability, security, and adjacent engineering roles at quant firms, hedge funds, and prop shops)
- Employer-board scraping on startup, every 5 minutes, and through a manual refresh
- A strict seven-day feed based on the employer-controlled posting timestamp
- Curated Frontier AI, Elite Quant, and Premium Tech watchlists selected for intern compensation, engineering reputation, and selectivity
- Filters for US location and undergraduate experience level, including sophomore-friendly roles
- Local PDF/DOCX resume storage and weighted fit scoring across skill coverage, related technologies, track alignment, eligibility, evidence quality, and location
- Opt-in AI resume tailoring for a selected role, with experience/project rewrites, honest skill ordering, ATS keywords, gap analysis, copy, and download
- A focused inbox: opening the original employer posting permanently hides that role locally
- Company-level interview and OA reports from recent Reddit discussions
- Track-specific technical and behavioral preparation advice
- GUI-configured email alerts for new roles and nearby deadlines, with 15-minute, hourly, six-hour, or daily delivery
- SQLite persistence with no accounts and no cloud data storage

## Run locally

Requirements: Node.js 22+ (Node 24 recommended). PDF extraction runs in-process; DOCX extraction uses `unzip`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first page load starts a source scan, the server and open dashboard resync every 5 minutes, and **Refresh roles** runs one immediately.

## Email alerts

Open **Alerts** in the sidebar and configure everything in the GUI. Choose Gmail, Outlook, Yahoo, or custom SMTP; enter the sending account's app password; choose a frequency; send a test; and enable alerts. Settings take effect without restarting and remain only in the local gitignored database. The app must be running for scheduled emails to send.

## AI resume tailoring

Open **Resume match**, select a role, and add an OpenAI API key the first time you generate a tailored draft. You can alternatively set `OPENAI_API_KEY` in `.env.local`. The key is stored only in the gitignored local database; the app uses `gpt-5.6-luna` through the Responses API with response storage disabled. Tailored drafts are saved locally and can be copied or downloaded as text.

The tailoring prompt is intentionally truth-preserving: it may reword and reorder evidence already present in the resume, but it must not invent skills, employers, responsibilities, outcomes, or metrics. Missing qualifications appear separately as skills to build.

## Local data and privacy

- Database: `data/internships.db`
- Resumes: `data/resumes/`
- Secrets: `.env.local`

All three are gitignored. Fit scoring and parsing stay completely local. Resume text is sent to OpenAI only when you explicitly click **Tailor with AI**; ordinary uploads, matching, scraping, and email alerts do not send it to an AI service.

## Source rules

The source adapters check public employer-hosted Greenhouse boards and the machine-readable data maintained by the [SimplifyJobs/Pitt CSC Summer 2027 repository](https://github.com/SimplifyJobs/Summer2027-Internships/tree/dev). A listing is accepted only when:

1. the employer title explicitly contains `intern` or `internship`;
2. it maps to SWE, ML, or adjacent engineering at a quant firm, hedge fund, or prop shop (no trader, researcher, portfolio, or analyst roles);
3. it is in the United States and is not remote;
4. it is not graduate/PhD/MBA-only, a co-op, or another season/year; and
5. it is explicitly Summer 2027, or has no conflicting year/season and falls inside the Summer 2027 recruiting window.

Add more public Greenhouse board slugs with `GREENHOUSE_BOARDS` in `.env.local`. Scraping is deliberately conservative and does not bypass authentication, CAPTCHAs, or site restrictions.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

This is a local personal tool, not a production deployment. Node's built-in SQLite API is used intentionally and may print an experimental warning on the current runtime.
