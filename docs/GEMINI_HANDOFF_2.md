# AGI Research Web — Handoff #2 for Gemini (restyle task)

You are taking over the **visual design** of an existing Next.js project. Reply to the user in **Thai**; keep code, identifiers and comments in **English**. You cannot see the repository: everything you need is below. If you need a file that is not reproduced here, **ask the user to paste it**. Never guess its contents.

The user will copy your files into the project by hand and then run the checks themselves, so be exact.

---

## 1. What has been done so far (state of the project)

Backend (NestJS + MySQL, `http://localhost:3001`) is finished and must not be touched. The Web frontend now has working, tested pages:

| route | what it does |
|---|---|
| `/` | Overview dashboard. Reads **MySQL directly** (`src/lib/queries.ts`). KPIs, Nexus orbit map, agents, run stream, benchmarks, system log |
| `/agents` | table from `GET /api/agents` + "register agent" form (Server Action) |
| `/experiments` | table from `GET /api/experiments` + "new experiment" form + per-row **RUN** launcher with a prompt input (Server Actions) |
| `/runs` | run list with status filter chips and pagination |
| `/runs/[id]` | run detail: status, prompt/params, output/metrics, evaluations, log, **Cancel** button for `queued` runs, live auto-refresh (polls `/api/runs/[id]/live` every 4s while the run is not finished and the tab is visible) |

Verified with `tsc --noEmit`, `npm run lint`, `npm run build` (all pass) and by driving the real pages in a browser (create agent/experiment, launch run, cancel, backend down, wrong token, mobile width). **Logic is done. Your job now is only the look and feel.**

Known visual issues I (Claude) saw in screenshots and did not fix:
1. On `/`, the "Agents" panel is as tall as the Nexus panel next to it, leaving a big empty area (grid items stretch). Fix with `align-self: start` or a better layout.
2. The Nexus `.sweep` wedge has a hard, ugly straight edge.
3. Overall it is functional but plain; the user said earlier it looked "ugly" (ขี้เหล่) and wants it **beautiful**.

## 2. THE TASK

Restyle the whole UI to be **elegant, delicate and "thin" (บางๆ), high-end ("เทพๆ")** using exactly this palette family: **light gray, black, red**.

Interpretation (follow it, but use taste):
- **Light gray** canvas and soft surfaces, **black** for chrome/typography/primary buttons, **red** only as a precise accent (active state, live/running, errors, key numbers, focus ring). Red must stay rare so it feels expensive.
- **Thin** = hairline 1px borders, weights 200–400, generous whitespace and letter-spacing, small caps/mono labels, subtle shadows (no heavy drop shadows), refined radii (4–10px), crisp alignment on an 8px rhythm.
- Real **UX** quality, not just colors: clear visual hierarchy, consistent spacing scale, readable table density, obvious hover/focus/active/disabled states, tidy empty/error/loading states, smooth but restrained motion, good forms.
- Contrast must stay at least **WCAG AA** (body text 4.5:1). Add visible `:focus-visible` rings. Respect `prefers-reduced-motion`.
- Must work at all three breakpoints: **≤1280px** (panels stack), **≤1000px** (sidebar collapses to a 60px icon rail), **≤700px** (single column, tables scroll horizontally inside `.table-scroll`).
- Keep the existing look-and-feel concept (HUD / command deck) but make it feel refined and modern.

## 3. WHICH FILES YOU MAY CHANGE

**Primary (almost everything happens here):**
- `src/app/globals.css` — the entire design system (about 378 lines). **Output the complete replacement file.**

**Presentational TSX you may edit if the design needs it** (markup/class names only, never logic):
- `src/components/hud/Shell.tsx` (exports `Shell`, `Loading`, `PageFrame`, `PageHero`, `Notice`, `Pager`)
- `src/components/hud/Sidebar.tsx`, `src/components/hud/Navbar.tsx`, `src/components/hud/NavLinks.tsx`
- `src/components/hud/StatusTag.tsx`, `src/components/hud/Icon.tsx` (SVG paths, stroke width), `src/components/hud/Nexus.tsx` (SVG, e.g. gradient stop colors), `src/components/hud/Clock.tsx`
- `src/app/layout.tsx` (fonts / metadata only)
- the JSX of `src/app/page.tsx`, `src/app/agents/page.tsx`, `src/app/experiments/page.tsx`, `src/app/runs/page.tsx`, `src/app/runs/[id]/RunLive.tsx`, `src/app/agents/AgentForm.tsx`, `src/app/experiments/ExperimentForm.tsx`, `src/app/experiments/RunLauncher.tsx`, `src/app/error.tsx`

If you change a TSX file, output it **complete** (see Output format) and keep every import, prop, hook, `"use client"`/`"use server"` directive, and data-fetching line exactly as is.

**DO NOT TOUCH (logic and security):**
`src/lib/*` (api.ts, types.ts, validate.ts, format.ts, runs.ts, queries.ts, db.ts), every `actions.ts`, `src/app/api/**` (route handlers), `next.config.ts`, `package.json`, `.env*`, `db/`, `scripts/`, the Backend project. Do not add dependencies (no UI kits, no chart libs, no animation libs). Do not add Tailwind utility classes: styling is hand-written CSS in `globals.css` (Tailwind v4 is only imported for its reset: `@import "tailwindcss";`).

## 4. Critical Next.js warning (this is NOT the Next.js you know)

Next **16.4.2**, React **19.3**, `cacheComponents: true`, `partialPrefetching: true`. Therefore:
- **Never** write `export const dynamic`, `revalidate`, `fetchCache` or any route-segment config.
- Anything reading request-time data (`searchParams`, `params`, API/DB calls) lives in an async component under `<Suspense>`, which starts with `await connection()` (from `next/server`). The page files already follow this: `export default function Page(props) { return <Shell><Content .../></Shell> }`. Keep that structure.
- Client hooks that read the URL (`usePathname`) must sit inside a `<Suspense>` (already done in `Sidebar.tsx` with a `NavStatic` fallback). Do not remove it or the production build fails.
- ESLint (`react-hooks/set-state-in-effect`) rejects calling `setState` synchronously in an effect body. Do not add such code.
- Never use `dangerouslySetInnerHTML`. Never print or hard-code secrets.
- For any Next API doubt, tell the user to check `node_modules/next/dist/docs/` rather than guessing.

## 5. Current design system (what exists now)

### Tokens on `:root` in `globals.css` (you may rename/extend, but if you remove one, update every use)
```
--bg #e9eaec        --surface #f6f6f7     --card #ffffff
--ink #0b0b0d       --ink-2 #17171a       --text #26272b
--dim #6b6d74       --faint #9a9ca3
--line rgba(11,11,13,.10)   --line-strong rgba(11,11,13,.22)
--red #d7141f       --red-hot #e5101d     --red-deep #7d0911   --red-glow rgba(229,16,29,.28)
--ok #1f8a4c        --warn #b97a0a
--on-dark #f1f1f3   --on-dark-dim #8d8f97   --line-dark rgba(255,255,255,.10)
--sidebar-w 232px   --nav-h 54px            --shadow (soft card shadow)
```
Fonts: Geist (`var(--font-geist-sans)`) body, Geist Mono (`var(--font-geist-mono)`) for labels/tables/logs. Both loaded in `layout.tsx`.

### Current look
Black sidebar + black navbar with a 2px red bottom line, light-gray page, white cards (radius 10px, tiny red tab on the top-left edge), first KPI card black with red glow, red progress bars, status tags (succeeded green outline, failed dark-red filled, running red filled pulsing, queued gray).

### Layout skeleton
```
.shell                     grid: sidebar | main
  <Sidebar/> (.sidebar)    sticky, 100vh
  .main
    <Navbar/> (.navbar)    sticky top, height var(--nav-h)
    .content               12-column grid, gap 16px, padding 22px 26px
      header.hero          grid-column 1 / -1  (kicker <small>, <h1>Word <em>Strong</em></h1>, <p> note)
      section.kpis > .kpi  5 KPI cards (overview only)
      section.panel.span-N cards; N in 3,4,5,7,8,12
```
`.span-7/.span-5/.span-8` become full width ≤1280px; `.span-3/.span-4` become half width ≤1280px and full width ≤700px.

### Every class name used by the TSX (you MUST keep styling all of them; adding new ones is fine)
```
shell main content booting sidebar brand brand-glyph brand-text nav-group nav-title nav-item (+ .active .disabled, with <em>SOON</em>) core-card led (+ .led-on .led-off)
navbar crumbs chips chip nav-right clock avatar
hero panel panel-head (span = title, em = meta) span-3 span-4 span-5 span-7 span-8 span-12 muted mono strong sub sub-line link num
kpis kpi hair (> i with inline width%) bench mix mix-bar mix-succeeded mix-running mix-queued mix-failed
nexus sweep ring ring-dash ring-ticks cross rot-slow rot-rev core-ring core-num core-cap spoke node node-halo node-name node-sub ping n-live n-bad n-pause n-idle
registry reg-name reg-meter reg-load dot dot-running dot-error dot-paused
table (global element styles) grid-table table-scroll tag (+ tag-succeeded tag-failed tag-running tag-queued tag-idle)
log (+ log-warn log-error log-tall) with <time> <b> <span>
form field-row field (label > span caption + input/select/textarea; textarea.mono) form-foot notice (+ notice-error notice-ok) hint
btn btn-sm btn-danger btn-ghost (+ .is-off on a non-link span) launcher launcher-msg (+ .ok .bad)
filters filter (+ .on) pager pager-meta kv kv-inline block block-error
```
Elements are also styled directly: `input, select, textarea, table, td, th, small, h1, h3, dl/dt/dd, pre`. `html, body` background/color live in `globals.css`.

Section ids used for sidebar anchors on `/`: `#nexus #agents #runs #benchmarks #logs`.

### Page content you are styling (so you know what real data looks like)
- Overview: 5 KPI cards, Nexus SVG (viewBox 500×500, centered core with success %), agent registry list with progress bars, run table with status tags, benchmark bars with big numbers, system log lines.
- Agents/Experiments/Runs: wide tables (mono, small, uppercase headers), forms with labeled fields, filter chips, pager.
- Run detail: key/value list, `<pre>` blocks for prompt and model output (must wrap long text), evaluations table, log list.
- Names are short uppercase codes (ORACLE-7, EXP-001); statuses are lowercase words; numbers use tabular figures.

## 6. Design brief ideas (use your judgment)
- A refined 3-tier gray scale + one black + one red; consider a very subtle paper/grain or hairline grid only if it does not hurt legibility.
- Cards: 1px hairline border, almost no shadow at rest, a slightly stronger shadow and 1px lift on hover; replace the red tab with a more elegant detail (e.g. a 1px red hairline segment, small index numeral).
- Typography: big light-weight numerals (200–300) for KPIs, tight tracking for headings, wide tracking mono for labels; define a type scale with CSS variables.
- Navigation: black sidebar with thin active indicator and subtle hover; navbar black or frosted light — your call, but keep it consistent.
- Tables: airy rows, hairline separators, sticky-feeling header caption style, tabular numbers, hover row tint, good `.tag` pills.
- Forms: refined inputs with a thin border, red hairline focus ring (+ soft glow), clear disabled and pending states on buttons (`:disabled`).
- Live state: `running` should feel alive (a restrained pulse), `failed` should be unmistakable but not loud.
- Nexus: replace the hard-edged `.sweep` wedge with a soft fading sweep; make rings thinner and labels crisper.
- Loading screen (`.booting`) and error screen (`src/app/error.tsx`) deserve a small touch of polish.

## 7. Output format (important — the user pastes by hand)

For **every file** you create or change output:
1. A heading with the path relative to the project root, e.g. `### src/app/globals.css`, marked **REPLACE ENTIRE FILE**.
2. The **complete file contents** in one fenced code block with the right language tag. Never output diffs or "…rest unchanged". `globals.css` must be delivered **in full**.
3. After the files, a short Thai summary: (a) what changed and why, (b) a before/after description of the main screens, (c) how to verify.

Self-check before replying:
- every class in the list in section 5 is still styled; no class used by TSX lost its rules
- no `export const dynamic`, no logic files touched, no new dependency, no secrets
- no Tailwind utility classes were introduced; colors use CSS variables
- AA contrast for text, visible `:focus-visible`, reduced-motion respected
- verified mentally at ≤1280px, ≤1000px and ≤700px (no horizontal page scroll; tables scroll inside `.table-scroll`)
- if you edited a TSX file, props/hooks/imports/directives are byte-for-byte unchanged apart from class names and markup

## 8. How the user will verify (so you know what must pass)
```
npx tsc --noEmit
npm run lint
npm run build
npm run dev   # then open /, /agents, /experiments, /runs, /runs/1 at desktop and phone widths
```
Known external issue, not your concern: the Web `.env.local` MySQL password for `agi_app` is currently rejected, so `/` may show "DB OFFLINE" and empty data until the user fixes it. Style the offline/empty states too (they are real states).
