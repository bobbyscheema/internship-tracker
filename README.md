# Internship Radar

A polished, local-first tracker for **US-based, onsite/hybrid Summer 2027 undergraduate internships** across software engineering, machine learning, and quantitative roles.

## Included

- Separate SWE, ML, and Quant Engineering feeds (software, quantitative developer, systems, infrastructure, data, reliability, security, and adjacent engineering roles at quant firms, hedge funds, and prop shops)
- Employer-board scraping on startup, every 5 minutes, and through a manual refresh
- A strict seven-day feed based on the employer-controlled posting timestamp
- Curated Frontier AI, Elite Quant, and Premium Tech watchlists selected for intern compensation, engineering reputation, and selectivity
- Filters for US location and undergraduate experience level, including sophomore-friendly roles
- Local PDF/DOCX resume storage and explainable fit scoring
- A focused inbox: opening the original employer posting permanently hides that role locally
- Company-level interview and OA reports from recent Reddit discussions
- Track-specific technical and behavioral preparation advice
- Daily SMTP email alerts for new roles and nearby deadlines
- SQLite persistence with no accounts and no cloud data storage

## Run locally

Requirements: Node.js 22+ (Node 24 recommended). PDF extraction runs in-process; DOCX extraction uses `unzip`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first page load starts a source scan, the server and open dashboard resync every 5 minutes, and **Refresh roles** runs one immediately.

## Email alerts

```bash
cp .env.example .env.local
```

Add SMTP credentials and restart the app. For Gmail, use an app password rather than your normal password. Alerts are evaluated every 30 minutes and sent once daily at `ALERT_HOUR` while the local app is running.

## Local data and privacy

- Database: `data/internships.db`
- Resumes: `data/resumes/`
- Secrets: `.env.local`

All three are gitignored. Resume text is extracted locally and is never sent to a third-party matching service.

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
