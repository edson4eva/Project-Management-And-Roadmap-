# Platforms Branch Project & Roadmap App

A portfolio dashboard for the Platforms Branch: project register, delivery
roadmap, team and resource directories, and executive reporting with Excel,
PDF and PowerPoint export.

Vanilla HTML, CSS and JavaScript — no framework and no build step. Three
source files served by nginx in a container.

## Views

| View | Purpose |
|------|---------|
| **Project command center** | Sortable/filterable register of every project, with a drill-down detail view per project and an optional timeline layout |
| **Portfolio roadmap** | Delivery timeline by fiscal quarter, grouped by unit, with collapsible units, a draggable label-column ruler, and a strategy/vision panel |
| **Team** | Team directory keyed to the eleven delivery roles |
| **Resources** | Resource directory by role across teams |
| **Executive reporting** | Filterable report with status mix charts, unit breakdowns, and print/export output |

## Portfolio model

**Six units**, each optionally carrying one sub-category:

- Unified Identity and Access Management → *Unified Messaging Service*
- Alberta Wallet and Credentials
- Alberta Payments → *eServices*
- CRA Income and Data Verification Services
- Web Services → *Learning Management System*
- Platforms Operations → *Privacy Portal*

Units have been renamed over the life of the portfolio, so `legacyUnitAliases`
in `app.js` remaps stored project records onto current names (for example
"Alberta Mobile Wallet" → "Alberta Wallet and Credentials"). Keep that map in
place when renaming a unit, or previously saved projects will orphan.

**Nine statuses**, rolled into four reporting bands:

| Band | Statuses |
|------|----------|
| In delivery | On track, In-flight |
| Needs attention | At risk, Off track, Pause |
| Upcoming | Planned, Next, Later |
| Completed | Completed |

**Eleven team roles** per project — Product Owner, Solution Sponsor,
Developer, Architect, Dev Lead, Scrum Master, Project Manager, Business
Analyst, Front End Designer, Service Designer, QA.

Quarters follow the Alberta fiscal year: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec,
Q4 Jan–Mar.

## Importing projects

Rather than entering projects by hand, use the Excel round trip:

1. **Download the intake template** from the template library — a formatted
   workbook whose columns are defined by `projectTemplateColumns`.
2. Fill in one row per project.
3. **Upload it** via the template upload control; rows are validated and
   converted by `templateRowToProject`, with row-level errors surfaced.

## Exporting

Every directory and report exports from the browser:

- **Excel** — `xlsx` for plain sheets, `exceljs` for the formatted intake template
- **PDF** — `jspdf` with `jspdf-autotable`
- **PowerPoint** — `pptxgenjs`, for the projects and roadmap decks

Filenames are stamped with the as-of date, e.g. `aster-team-directory-2025-09-10.xlsx`.

## Stack

| Dependency | Version | Loaded from |
|------------|---------|-------------|
| lucide (icons) | 0.468.0 | unpkg |
| xlsx | 0.18.5 | jsDelivr |
| exceljs | 4.4.0 | jsDelivr |
| jspdf + autotable | 2.5.2 / 3.8.4 | jsDelivr |
| pptxgenjs | 3.12.0 | jsDelivr |

All five are loaded from CDN at runtime, so **the app needs outbound network
access for exports to work**. The UI itself still renders without them.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All markup: login screen, nav, and the five views |
| `styles.css` | All styling |
| `app.js` | State, rendering, portfolio model, import/export |
| `Dockerfile` | `nginx:alpine`, serving on 8080 |
| `default.conf` | nginx config; sends `Cache-Control: no-cache, must-revalidate` |

`default.conf` deliberately disables caching. `index.html`, `app.js` and
`styles.css` are versioned together by each deploy, and without that header
browsers guess at freshness per file — which lets a stale `app.js` run against
a fresh `index.html`.

## Run locally

No build step, so any static server works:

```bash
python3 -m http.server 8000     # http://localhost:8000
```

Or build the real image:

```bash
docker build -t pm-roadmap . && docker run --rm -p 8080:8080 pm-roadmap
```

## Deploy

```bash
cd /mnt/data/projects/project-management-roadmap
publish-app pm-roadmap
```

Live at <https://pm-roadmap-edson.sandbox.aim.int.gov.ab.ca>. A newly
published app must be registered at
<https://apps.sandbox.aim.int.gov.ab.ca> before the gateway URL resolves.

## How data is stored

Everything is in `localStorage`, under these keys:

| Key | Holds |
|-----|-------|
| `pb-projects-v2` | The project register |
| `pb-teams-v2` | Team directory |
| `pb-roadmap-v2` | Roadmap scope and strategy panel |
| `pb-collapsed-units-v1` | Which units are collapsed |
| `pb-timeline-label-width-v1` | Dragged width of the timeline label column |
| `platforms-branch-session` | Signed-in session (`localStorage` if "remember me", else `sessionStorage`) |

## Known limitations

**The login screen is not access control.** It checks the typed password
against `DEFAULT_PASSWORD` in `app.js` — a constant shipped to the browser in
plain JavaScript, readable by anyone who opens developer tools or views
source. Any email address is accepted. It is a demo affordance for showing the
signed-in experience, and it protects nothing. Treat every deployment as
publicly readable by anyone who can reach the URL, and do not put information
in it that could not be shared that way. Real authentication would have to
come from the gateway or a server-side session.

**Storage is per browser.** Each visitor gets their own copy of the portfolio
and nothing syncs between people, devices or profiles. Two people editing the
roadmap do not see each other's changes, and clearing site data discards
everything. Shared state needs a backend — on this platform,
`publish-app --database` provisions Cloud SQL.

**The reporting date is pinned.** `AS_OF_DATE` in `app.js` is fixed at
2025-09-10, and variance, forecast and "today" markers are all calculated from
it rather than the real clock. Seed data came from the September 2025
Platforms Roadmap deck. Update that constant when refreshing the snapshot.
