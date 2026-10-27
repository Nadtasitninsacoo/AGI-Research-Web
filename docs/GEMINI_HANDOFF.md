# AGI Research Web — Handoff Prompt for Gemini

You are taking over front-end development of an existing project from another AI (Claude). You **cannot see the repository** — everything you need is in this file. The user will copy your code into the project by hand, so follow the **Output format** section exactly. Reply to the user in Thai; keep code, identifiers and comments in English.

If you need to see an existing file that is not reproduced here, **ask the user to paste it**. Never guess its contents.

---

## 1. Project

"AGI Research" — an internal dashboard for an AGI research system: agents, research projects, experiments, runs, benchmarks and logs. Data lives in **MySQL 8**. The UI is a sci-fi "alien AI" HUD: dark gray/black surfaces, deep-red accent, hairline strokes, thin light-weight type, wide-tracked uppercase labels.

## 2. Stack — and a critical warning

- **Next.js 16.4.2** (App Router, `src/` dir, Turbopack), **React 19.3**, **TypeScript**, **Tailwind v4** (only `@import "tailwindcss"` is used; styling is hand-written CSS in `src/app/globals.css`), **mysql2**.
- Path alias: `@/*` → `src/*`.
- **This is NOT the Next.js you know.** `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`. Consequences you MUST respect:
  - **Never** write `export const dynamic = ...`, `revalidate`, `fetchCache` or any other route segment config — it is a build error under `cacheComponents`.
  - Any page/component that reads the database (uncached, request-time data) must run **inside a `<Suspense>` boundary**, and the async function that does the query must call `await connection()` (from `next/server`) first.
  - Pattern used by the dashboard:
    ```tsx
    import { Suspense } from "react";
    import { connection } from "next/server";

    export default function Page() {
      return (
        <Suspense fallback={<Booting />}>
          <Data />
        </Suspense>
      );
    }

    async function Data() {
      await connection();
      const data = await getDashboardData(); // MySQL
      return /* JSX */;
    }
    ```
  - Route handlers (`route.ts`) that query MySQL also call `await connection()` first.
  - Layouts/pages use the global `LayoutProps<"/">` / `PageProps<...>` helper types (no import needed).
- Components are **Server Components by default**. Add `"use client"` only for state/effects/browser APIs (the only client component today is `Clock`).
- When unsure about any Next API, tell the user to check `node_modules/next/dist/docs/` rather than relying on memory.

## 3. File map (current)

```
db/schema.sql                      MySQL schema (idempotent)
scripts/db-setup.mjs               creates DB + app user + applies schema  (npm run db:setup)
scripts/db-seed.mjs                demo data, only if DB empty             (npm run db:seed)
docs/GEMINI_HANDOFF.md             this file
src/lib/db.ts                      exports `db` (mysql2 promise pool, cached on globalThis)
src/lib/queries.ts                 getDashboardData() + types
src/app/layout.tsx                 fonts (Geist + Geist Mono), metadata
src/app/globals.css                the entire design system
src/app/page.tsx                   dashboard (Suspense + connection())
src/app/api/health/route.ts        proxy health check to AGI_API_URL
src/app/api/db-health/route.ts     MySQL health check
src/components/hud/Icon.tsx        thin-stroke SVG icons
src/components/hud/Sidebar.tsx     left nav
src/components/hud/Navbar.tsx      top bar
src/components/hud/Nexus.tsx       SVG orbit map of agents
src/components/hud/Clock.tsx       client component, live clock
```

Env vars (in `.env.local`, never commit, never print real values): `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` (`agi_research`), `DATABASE_USER` (`agi_app`, SELECT/INSERT/UPDATE/DELETE only), `DATABASE_PASSWORD`, `AGI_API_URL`. Do not ask the user for the MySQL root password and do not put credentials in code.

## 4. Database (MySQL, utf8mb4, InnoDB)

| table | columns |
|---|---|
| `users` | id, email (unique), display_name, role ENUM(admin,researcher,viewer), created_at, updated_at |
| `agents` | id, name (unique), description, model, config JSON, status ENUM(idle,running,paused,error,retired), created_by→users, created_at, updated_at |
| `research_projects` | id, title, summary, status ENUM(draft,active,completed,archived), owner_id→users, created_at, updated_at |
| `datasets` | id, name, description, source_uri, version, metadata JSON, created_at; unique(name,version) |
| `experiments` | id, project_id→research_projects (CASCADE), agent_id→agents, dataset_id→datasets, name, hypothesis, status ENUM(planned,running,completed,failed,cancelled), created_at, updated_at |
| `experiment_runs` | id, experiment_id→experiments (CASCADE), params JSON, metrics JSON (e.g. `{"accuracy":0.87}`), status ENUM(queued,running,succeeded,failed,cancelled), error_message, started_at, finished_at, created_at |
| `evaluations` | id, run_id→experiment_runs (CASCADE), benchmark, score DOUBLE (0..1), details JSON, created_at |
| `agent_logs` | id, agent_id→agents (CASCADE), run_id→experiment_runs, level ENUM(debug,info,warn,error), message, context JSON, created_at |

Schema changes go into `db/schema.sql` as **idempotent** statements (`CREATE TABLE IF NOT EXISTS`, and guarded `ALTER`). Tell the user to re-run `npm run db:setup` (needs the MySQL admin password as env var `MYSQL_ADMIN_PASSWORD`, which the user supplies).

### Data layer contract

```ts
// src/lib/queries.ts (existing exports)
type AgentStat = { id:number; name:string; model:string|null;
  status:"idle"|"running"|"paused"|"error"|"retired"; description:string|null;
  runs:number; succeeded:number; failed:number; avgScore:number|null };
type RunRow = { id:number; status:string; experiment:string; agent:string|null;
  accuracy:number|null; createdAt:Date };
type LogRow = { id:number; level:"debug"|"info"|"warn"|"error"; message:string;
  agent:string; createdAt:Date };
type BenchmarkRow = { benchmark:string; score:number; n:number };
type DashboardData = {
  totals:{ agents:number; agentsRunning:number; projects:number; experiments:number;
           runs:number; runsRunning:number; runsQueued:number;
           runsSucceeded:number; runsFailed:number };
  agents:AgentStat[]; runs:RunRow[]; logs:LogRow[]; benchmarks:BenchmarkRow[];
};
export async function getDashboardData(): Promise<DashboardData>;
```

Query rules: always parameterized (`db.query(sql, [params])`), never string-concatenate user input; wrap numeric columns from `AVG/COUNT/SUM` in `Number()` (mysql2 can return strings); new queries go in `src/lib/queries.ts` (or a new `src/lib/<domain>.ts`) — never inside components. Never fabricate metrics: if the DB cannot provide a number, don't invent it.

## 5. Design system (match it exactly)

### Philosophy
Everything is **thin and light**: 1px borders, 2px bars, font-weight 200–300, tiny uppercase mono labels with wide tracking. Red is used sparingly as glowing accents (active state, live data, corners, progress). No heavy shadows, no thick borders, no rounded-pill buttons, no gradients except subtle red→dark. Respect `prefers-reduced-motion`.

### Tokens (defined on `:root` in `globals.css` — always use the variables, never hard-code colors)

```
--bg #060607        --surface rgba(20,20,23,.62)
--line rgba(255,255,255,.08)   --line-strong rgba(255,255,255,.16)
--text #d6d7da      --dim #8a8c93     --faint #55575d
--red #e5101d       --red-hot #ff2a36 --red-deep #7d0911   --red-glow rgba(229,16,29,.35)
--ok #7fd49a        --warn #d9a441
--sidebar-w 232px   --nav-h 54px
```

### Typography
- Body: Geist (`var(--font-geist-sans)`), weight 300. Big numbers: weight **200**.
- Labels/tables/logs/chips: Geist Mono (`var(--font-geist-mono)`), uppercase, `letter-spacing` 0.18em–0.35em, sizes 0.5–0.7rem.

### Layout skeleton
```
.shell                grid: sidebar | main
  <Sidebar/>          sticky, 100vh, hairline right border
  .main
    <Navbar/>         sticky top, blurred, hairline bottom with red gradient segment
    .content          12-column grid, gap 14px
```
Panels span columns with `.span-3 .span-4 .span-5 .span-7`; `.kpis` and full-width rows use `grid-column: 1 / -1`. Breakpoints: ≤1280px (panels stack), ≤1000px (sidebar collapses to a 60px icon rail), ≤700px (single column). New UI must work at all three.

### Class catalog (already in `globals.css`)

| class | use |
|---|---|
| `.panel` + `<header className="panel-head"><span>NN // TITLE</span><em>META</em></header>` | standard card; red corner brackets come from pseudo-elements |
| `.kpis` > `.kpi` (`<small>` label, `<b>` value, `<span>` sub, `.hair` bar) | KPI strip |
| `.hair` > `<i style={{width:"NN%"}}/>` | 2px red progress bar |
| `.tag .tag-succeeded/.tag-failed/.tag-running/.tag-queued` | thin outlined status pill |
| `.dot .dot-running/.dot-error/.dot-paused` | status dot |
| `.chip` | rounded hairline chip (navbar) |
| `.led .led-on/.led-off` | tiny status light |
| `.registry`, `.bench`, `.log` (`.log-warn/.log-error`), `table/td` | list/row styles |
| `.nav-item .active/.disabled`, `.nav-group`, `.nav-title` | sidebar menu (32px high, hairline border, uppercase) |
| `.muted` | dim text |

Section ids used by the sidebar anchors: `#top`, `#nexus`, `#agents`, `#runs`, `#benchmarks`, `#logs`.

### Canonical panel snippet
```tsx
<section className="panel span-5" id="runs">
  <header className="panel-head"><span>03 // RUN STREAM</span><em>LATEST 8</em></header>
  {/* content */}
</section>
```
Number panels sequentially `NN // TITLE`.

### Icons
`<Icon name="agents" />` — 24×24 viewBox, `stroke="currentColor"`, `strokeWidth="1"`, round caps, `fill="none"`. To add one, add a path string to the `PATHS` map in `Icon.tsx` (names: overview, agents, runs, bench, logs, experiments, datasets, settings, glyph). Keep icons single-weight, geometric, line-only.

### Sidebar rules
`Sidebar.tsx` has `NAVIGATE` (items with `href`) and `WORKSPACE` (items without `href` render as disabled with a `SOON` badge). Only link to routes/anchors that **exist**. When you build a real page (e.g. `/experiments`), give that sidebar item an `href`, and — because the active state is currently hard-coded to Overview — convert the nav item to a small `"use client"` component using `usePathname()` to compute `active`.

## 6. Coding rules

1. Match the surrounding code: same naming, same (sparse) comment density, `const` arrow helpers like `pct`, small focused components.
2. Server Components by default; keep `"use client"` islands tiny.
3. TypeScript strict-friendly: no `any`; cast mysql2 rows via `RowDataPacket`.
4. No new dependencies unless unavoidable — if you need one, say so and give the exact `npm install` command. No UI kits, no chart libraries: charts are hand-built SVG/CSS in the HUD style.
5. No emoji in UI. No lorem ipsum. Empty states are lowercase muted text (`no runs recorded`).
6. Accessibility: SVGs get `role="img"` + `aria-label` or `aria-hidden`; interactive elements are real `<a>`/`<button>`.
7. Don't touch or print secrets. Don't edit `.env.local`.
8. Do not rewrite files that don't need to change.

## 7. Suggested next work (in priority order — confirm with the user which one first)

1. Pages for the disabled sidebar items: `/experiments`, `/datasets`, `/settings`, plus detail pages `/agents/[id]` (the existing `AgentStat` + that agent's runs and logs). Dynamic route params are async in this Next version (`params` is a Promise) — verify in the docs before using.
2. Live refresh of the dashboard (client island that calls `router.refresh()` on an interval, or an SSE route) — keep it opt-out and pause when the tab is hidden.
3. Write operations: create agent / experiment / run via Route Handlers or Server Actions with validation, using only `INSERT/UPDATE/DELETE` (the app DB user has no DDL rights).
4. Charts in the HUD style: run success over time (needs a query grouped by `DATE(created_at)`), score-per-benchmark sparklines.

## 8. Output format (important — the user pastes by hand)

For **every file** you create or change, output:

1. A heading line with the path relative to the project root, e.g. `### src/components/hud/RunTable.tsx` and whether it is **NEW** or **REPLACE ENTIRE FILE**.
2. The **complete file contents** in one fenced code block with the right language tag. Never output diffs, "…rest unchanged", or partial snippets for TS/TSX/SQL files.
   - Exception: `globals.css` is large. For CSS, output **only the new rules**, in a block titled `APPEND to the end of src/app/globals.css`, and reuse existing tokens/classes before inventing new ones. If you must change an existing rule, show the old rule and the new rule explicitly.
3. After the files: a short Thai summary of (a) what changed, (b) any commands to run (`npm install …`, `npm run db:setup`), (c) how to verify (URL to open, what to look for).

Before finishing, self-check: no `export const dynamic`, DB access is under `<Suspense>` + `connection()`, colors use CSS variables, strokes are 1px, weights are 200–300, it works at the three breakpoints, and no secrets appear anywhere.
