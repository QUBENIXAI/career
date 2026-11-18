# Qubenix AI — Careers

Next.js 16 (App Router) + React 19 + TypeScript. Icons from `lucide-react`; no other runtime dependencies.

```bash
npm install
npm run dev        # http://localhost:3100/careers
npm run build && npm start
npm run typecheck
```

## Routes

| Route | What it is |
| --- | --- |
| `/careers` | Stats bar, job categories (featured + 4 cards), how it works, Life at Qubenix carousel |
| `/careers/positions` | Every role, filterable by team, plus a "Saved" filter for bookmarked roles |
| `/careers/apply?role=<slug>` | Application form with the role preselected |
| `POST /api/careers/apply` | Validates an application and forwards it to Google Apps Script |
| `/` | Redirects to `/careers` |

## Structure

```
app/
  layout.tsx                  font (next/font), metadata, fade-in observer
  careers/careers.css         design tokens on :root + all component styles
  careers/page.tsx            CareersStats · JobCategories · HowItWorks · TeamExperience
  careers/positions/page.tsx
  careers/apply/page.tsx
  api/careers/apply/route.ts
components/careers/
  CareersStats, JobCategories, JobCards (FeaturedJobCard, JobCard, PositionRow),
  HowItWorks (CareerSteps), TeamExperience, TestimonialCarousel,
  PositionsList, ApplyForm, BookmarkButton, SiteChrome, icons, RevealOnScroll
lib/careers.ts                roles, culture items, stats, steps, shared field + resume validation
lib/server/                   Apps Script client, anti-spam form token, rate limiter (server-only)
apps-script/                  Code.gs + manifest + tests (deployed to Google, not Next.js)
```

Server components by default; only the bookmark button, carousel, positions filter, apply form and fade-in observer run on the client.

## Editing content

- **Roles**: edit `ROLES` in `lib/careers.ts`. The role with `featured: true` becomes the large card; the next four fill the 2×2 grid. All pages and the API read from this list.
- **Life at Qubenix**: edit `CULTURE`. There are deliberately no testimonials, names or ratings; add those only once you have genuine ones.
- **Photos** in the carousel and the How It Works collage are Unsplash stock placeholders. Put real team photos in `public/careers/` and point the `image` / `PHOTOS` entries at them; you can then drop `images.remotePatterns` from `next.config.mjs`.

## Receiving applications

Applications are stored by **Google Apps Script** in **Google Sheets** (one row per candidate) and **Google Drive**
(private resume files). Setup, permissions, settings and troubleshooting: [`apps-script/README.md`](apps-script/README.md).

The Next.js server needs two variables (see `.env.example`):

```bash
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/…/exec
APPS_SCRIPT_SHARED_SECRET=…   # logged by setup() in the Apps Script editor
```

Without them the form validates but tells applicants submissions aren't open yet.

Flow: `ApplyForm` (resume upload with progress) → `POST /api/careers/apply` (multipart; validation, honeypot,
signed anti-spam token, per-IP rate limit, file type/size/content checks) → Apps Script `doPost` (validates again,
dedupes, uploads to Drive, appends to Sheets, emails the team and the candidate) → Application ID shown to the candidate.

```bash
npm run test:apps-script   # Code.gs tests against mocked Google services
npm run mock:apps-script   # local fake Web App for end-to-end testing
```

## Merging into the main Qubenix site

Copy `app/careers`, `app/api/careers`, `components/careers`, `lib/careers.ts` and `lib/server`, and import `careers.css` from the careers layout instead of the root layout. The CSS is plain class-based CSS, so it doesn't depend on Tailwind being present.
