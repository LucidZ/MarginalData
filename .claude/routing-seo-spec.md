# Routing & Sharing Infrastructure — Development Spec

Migrate off `HashRouter` to real path-based URLs, and make individual
projects properly shareable (per-page `<title>`/description/OG image
instead of one generic card for the whole site). Triggered by: about to
start actively sharing/promoting specific projects, and this is the
cheapest point to change URLs (nothing indexed or bookmarked yet).

Context this decision came from: site has ~16 small demos and near-zero
traffic today. The router swap + static per-route pages are being done
*now*, before any hash URLs get shared, specifically to avoid a second
migration later. Prerendered OG *images* are lower priority than the
routing/meta-tag work — can ship in a follow-up pass.

## Current State (as of 2026-08-03)

- Vite + React 19 SPA, client-rendered only, no SSR/SSG framework.
- `src/App.tsx` uses `HashRouter` — URLs look like
  `marginaldata.com/#/2026/MarginalTax`. Everything after `#` never
  reaches the server and is invisible to most crawlers/link-preview bots.
- Deployed to GitHub Pages via `gh-pages -d dist` (see `package.json`
  `deploy` script), custom domain `marginaldata.com` /
  `www.marginaldata.com` via `public/CNAME` (Vite copies `public/*` into
  `dist/` root automatically — unaffected by this work).
- `public/_redirects` exists but is Netlify-only syntax; GitHub Pages
  ignores it. Harmless, can leave or delete.
- Recently added, already live, keep as-is: `public/robots.txt`
  (permissive), global `<Header>` (`src/components/Header.tsx`, static
  not sticky — don't make it sticky, it collides with several pages'
  own `position: sticky` viz panels, see below), grouped `HomePage`
  (`src/pages/HomePage.tsx`), site-wide `<meta description>` +
  OG/Twitter tags in `index.html`.
- Routes are hardcoded twice today: once as `lazy()` imports + `<Route>`
  JSX in `App.tsx`, once as `<Link>` entries in `HomePage.tsx`. No
  single source of truth for path → title/description.

### Known layout hazard

Several pages pin their own viz panel with `position: sticky` or
`position: fixed` at `top: 0` (mobile nav in `MarginalTax/App.css`,
`VoterAffiliation/App.css`, `PassingTriangleMatchingGame/App.css`, some
up to `z-index: 1000`). This is why the site header is deliberately
*not* sticky. Nothing in this spec should need touching those files,
but if any future global chrome becomes sticky, re-verify against these
pages specifically (scroll-test on mobile viewport, not just desktop).

## Target State

- Real paths: `marginaldata.com/2026/MarginalTax` (keep existing casing
  and structure — swapping router type, not renaming URLs. Kebab-case
  URL cleanup is a separate, optional, out-of-scope decision — flag it
  to the user if it comes up, don't do it silently as part of this).
- Each route resolves to a real static `index.html` file in `dist/`
  with correct per-page `<title>`, `<meta description>`, OG/Twitter
  tags baked in as static HTML (readable by non-JS scrapers, not just
  Google). The SPA JS bundle then boots normally and `BrowserRouter`
  takes over client-side rendering for in-app navigation.
- A GitHub Pages 404.html fallback still exists as a safety net for any
  path not covered by a generated static page (shouldn't normally be
  hit if every route is generated, but protects against a route added
  to `App.tsx` and forgotten in the manifest, or a typo'd URL).
- `robots.txt` stays permissive; add a generated `sitemap.xml` listing
  real per-route URLs (cheap add once the manifest exists).

## Implementation Steps

### 1. Single route manifest (do this first — everything else reads from it)

Create `src/routes.ts`:

```ts
export interface RouteEntry {
  path: string;            // "/2026/MarginalTax"
  title: string;           // "How Marginal Tax Rates Actually Work — Marginal Data"
  description: string;     // one-line, ~150 char, used for <meta description> and OG
  component: () => Promise<{ default: React.ComponentType }>; // the lazy() import
  group: string;           // "Government & Politics" etc — matches HomePage.tsx groups
  image?: string;          // "/og/marginal-tax.png" — optional, added in phase 2
}

export const ROUTES: RouteEntry[] = [
  // one entry per existing <Route> in App.tsx today, e.g.:
  {
    path: "/2025/USAIDSize",
    title: "How big was USAID? — Marginal Data",
    description: "…",
    component: () => import("./2025/USAIDSize"),
    group: "Government & Politics",
  },
  // ...
];
```

Refactor `App.tsx` to map `ROUTES` into `<Route>` + `lazy()` entries
instead of the current hardcoded list, and refactor `HomePage.tsx` to
group `ROUTES` by `.group` instead of its own separate `GROUPS` array.
This removes the current duplication between the two files and is a
prerequisite for the prerender script (step 3) to know what to
generate. Write real per-route `description` copy for all ~16 routes
while doing this — don't leave placeholders.

### 2. Swap the router

In `src/App.tsx`: `HashRouter` → `BrowserRouter`. One-line change once
step 1 is done.

### 3. GitHub Pages SPA fallback (`public/404.html`)

Add the standard `spa-github-pages` redirect pattern
(github.com/rafgraph/spa-github-pages): `404.html` encodes the
requested path into a query string and redirects to `/`; a small
inline script in `index.html` (before the app mounts) reads that query
string and calls `history.replaceState` to restore the real path
before React Router takes over. This is the fallback for anything not
covered by step 4 below — with step 4 in place it should rarely fire,
but keep it as a safety net.

### 4. Post-build static page generation

New script `scripts/generate-static-pages.mjs`, run after `vite build`:

- Import `ROUTES` from `src/routes.ts` (Node can't import `.tsx`
  components, but doesn't need to — only needs `path`/`title`/
  `description`/`image`, so keep the manifest metadata plain-data and
  colocate component imports separately if type-checking gets in the
  way, or run this via `tsx`/`esbuild-register` since the repo already
  has TypeScript tooling).
- Read the built `dist/index.html` as a template.
- For each route: string-replace `<title>`, `<meta name="description">`,
  `og:title`, `og:description`, `og:url`, `og:image` (if present),
  `twitter:*` tags with that route's values; write the result to
  `dist/<path>/index.html` (create directories as needed, e.g.
  `dist/2026/MarginalTax/index.html`).
- Also generate `dist/sitemap.xml` from the same manifest while you're
  in there (list of absolute URLs) — trivial once this script exists.
- Wire into `package.json`: `"build": "vite build && node scripts/generate-static-pages.mjs"`.

### 5. OG images (separate, lower-priority pass — do after 1–4 are shipped and verified)

- Not a build-time step: run manually, commit resulting images. A
  headless-browser screenshot step on every build is slower and more
  fragile than it's worth for content that changes rarely.
- `scripts/generate-og-images.mjs`: Playwright script (the repo already
  has Playwright for the `tests/` scaffold — reuse it, don't add a new
  dependency) that boots `vite preview`, navigates to each route in
  `ROUTES`, screenshots at a size suited for cropping to 1200×630, saves
  to `public/og/<route-slug>.png`.
- Add the resulting path to each route's `image` field in
  `src/routes.ts` once generated.
- Skip routes where a generic screenshot wouldn't read as a good social
  card (e.g. anything mid-interaction/blank-state) — a missing `image`
  field should fall back to a single generic site-level OG image
  (need to create one), not break the build.

## Testing / Verification

- `vite preview` does **not** reproduce GitHub Pages' static-file
  behavior accurately for this. After building, serve `dist/` with a
  plain static server that has *no* SPA fallback (e.g. `npx serve dist`
  with default settings) and manually check: does a hard refresh on
  `/2026/MarginalTax/` load correctly? Does a request to a path with no
  generated page correctly hit `404.html` and redirect?
- Grep `dist/` after build to confirm one `index.html` per route exists
  with the right `<title>` baked in (quick automated check, e.g.
  `grep -l "How Marginal Tax" dist/2026/MarginalTax/index.html`).
- OG/Twitter card correctness can only be verified against the *live*
  deployed domain — Slack/Twitter/LinkedIn card debuggers fetch the
  real URL. This step has to happen after an actual deploy, and it's a
  manual check for the user to do (e.g. opengraph.xyz, LinkedIn Post
  Inspector), not something verifiable in a local/dev environment.
- Confirm `gh-pages -d dist` still publishes everything (it publishes
  the whole `dist/` tree, so the extra per-route files should just work
  — but confirm dist size/file count looks sane before deploying, this
  will go from ~40 files to ~60+).

## Explicitly Out of Scope

- Full SSR/content hydration for crawlers — Google already executes JS
  well enough for actual page-content indexing; this spec only fixes
  `<title>`/meta/OG for non-JS scrapers and clean URLs.
- Renaming existing route paths to kebab-case or otherwise
  "prettifying" URLs — flag as a future option if it comes up, don't
  bundle it into this change.
- Auto-regenerating OG images on every build — manual/on-demand only
  (step 5).
- Redirecting old hash-style URLs (`/#/2026/MarginalTax`) to new paths
  — skip unless it turns out something got shared/bookmarked with the
  old format before this ships.
