---

## name: Frontend — hotel marketplace + video tours

parent_plan: docs/plans/hotel_marketplace_video_tours.md
overview: Frontend-only implementation plan derived from the main marketplace plan — Next.js surfaces, non-Tailwind styling choice, interactive tour player, accessibility, and phased delivery aligned with Phase A–D of the parent plan.

**Parent plan:** [hotel_marketplace_video_tours.md](hotel_marketplace_video_tours.md) — scope, domain model, video CDN, security, and cross-stack phases are authoritative. This document **only** covers web UI architecture, routes, components, and frontend acceptance criteria.

**Revision log:** `2026-04-23` — Initial frontend sub-plan created from parent plan (including non-Tailwind frontend direction).

# Frontend plan: hotel marketplace + interactive video tours

## 1. Goals and boundaries

### In scope (frontend)

- **Guest marketplace:** browse/search hotels, hotel detail, room type detail, **interactive tour experience** (lobby + room flows), **inquiry** forms with validation and optimistic UX.
- **Hotel dashboard:** auth screens, property profile, media uploads (status driven by parent pipeline), **tour builder** (ordering steps, copy, publish/draft), basic analytics hooks if PostHog is adopted.
- **Platform admin (thin v1):** moderation/report queues can start as minimal internal pages or defer to a second app; parent plan owns policy — UI is tables + detail drawers.
- **Design system:** tokens (color, type, spacing, radii, motion), layout primitives, responsive behavior, **WCAG-oriented** tour chrome (see §7).

### Out of scope (frontend)

- Payment/checkout UI (excluded in parent v1).
- Native mobile apps (responsive web only).
- Backend implementation details — frontend consumes **documented API contracts** and video **manifest** shape agreed with backend (mirror parent **TourStep** / published snapshot model).

## 2. Alignment with parent plan (traceability)


| Parent section                              | Frontend obligation                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Experience model (state machine + overlays) | Implement **TourPlayer** driven by server-provided manifest; no hardcoded tour graphs in the client build. |
| Tour manifest schema                        | TypeScript types + runtime validation (e.g. Zod) for manifest JSON; version mismatch → safe UI error.      |
| Signed URL refresh                          | Player module requests refreshed playback URLs before expiry; preserve step index (parent test scenario).  |
| Search / filters MVP                        | Filter UI + URL-synced query params; debounced search; empty/loading/error states.                         |
| Availability policy                         | Copy and field visibility follow whichever v1 policy parent locks (informational / manual / hidden).       |
| Accessibility                               | Captions UI, keyboard path, focus management, `prefers-reduced-motion` (parent §Accessibility).            |
| Phases A–D                                  | Frontend milestones below map **1:1** to parent phases.                                                    |


## 3. Stack decisions (must be resolved early)

**Locked from parent:** Next.js (App Router) + TypeScript; **no Tailwind**; no shadcn as default.

**Open decision (do first):** pick **one** primary styling direction (parent “Frontend” section):

- **Path A — Component library:** Mantine *or* MUI *or* Ant Design (document choice + theme tokens in `/docs/design-tokens.md` or colocated `theme.ts` once repo exists).
- **Path B — Headless + CSS:** Radix *or* React Aria Components + **Vanilla Extract** or **CSS Modules + PostCSS**.
- **Path C — CSS-in-JS:** Emotion or styled-components + internal primitives.

**Deliverable for “pick styling stack”:** ADR-style note (1 page) listing choice, bundle impact, SSR compatibility with Next.js, and how **video player** controls will be styled (native controls vs fully custom chrome).

**Forms:** React Hook Form + Zod (parent). **Icons:** Lucide or Phosphor.

## 4. Information architecture and routes (suggested)

Assume default locale segment optional (`/[lang]` deferred until i18n is real).


| Route                             | Surface  | Purpose                                                              |
| --------------------------------- | -------- | -------------------------------------------------------------------- |
| `/`                               | Guest    | Marketing + featured listings entry                                  |
| `/browse`                         | Guest    | Search results + filters                                             |
| `/hotels/[slug]`                  | Guest    | Hotel profile, hero, amenities, **start tour** CTA                   |
| `/hotels/[slug]/rooms/[roomSlug]` | Guest    | Room detail + **room tour** entry                                    |
| `/tours/[hotelSlug]/[tourId]`     | Guest    | Fullscreen or focused **TourPlayer** shell (query `?room=` optional) |
| `/inquiry/success`                | Guest    | Post-submit confirmation                                             |
| `/auth/`*                         | Hotel    | Sign-in, magic link callback (exact shape depends on auth provider)  |
| `/dashboard`                      | Hotel    | Layout shell + nav                                                   |
| `/dashboard/property`             | Hotel    | Profile, photos, policies text                                       |
| `/dashboard/tours`                | Hotel    | List tours                                                           |
| `/dashboard/tours/[tourId]/edit`  | Hotel    | Step editor, reorder, preview, publish                               |
| `/dashboard/media`                | Hotel    | Upload queue + pipeline status (parent media states)                 |
| `/admin/`*                        | Platform | Internal; protect by role (defer if v1 is single-tenant pilot)       |


**SEO:** server-rendered shells for `/browse`, `/hotels/`*; tour player route may be client-heavy — still ship **metadata** (title/description) and **Open Graph** image per hotel from server.

## 5. Client vs server boundaries (Next.js)

- **Server Components:** listing grids, static marketing blocks, hotel header blocks that only need manifest **summary** (duration, step count, poster URLs).
- **Client Components:** `TourPlayer`, video element integration, drag-and-drop reorder in tour builder, file upload progress, map interactions, filter panels that write to URL without full navigation (or hybrid).
- **Boundary rule:** keep **network secrets** server-side; client receives only short-lived playback tokens and **public** manifest fields.

## 6. Core feature modules

### 6.1 TourPlayer (critical path)

- **Inputs:** `tourManifest` (typed), `initialStepIndex`, callbacks `onStepChange`, `onComplete`, `onRequestTokenRefresh`.
- **State machine:** explicit states `loading` → `playing` → `pausedForInteraction` → `advancing` → `ended` / `error`.
- **UI layers:** video layer; **step chrome** (title, body, optional image); **CTA bar** (Continue disabled/enabled per `requiresUserContinue`); optional **narration** audio element synced to step start.
- **Captions:** WebVTT track per clip or per step; toggle in player; language selector if multiple tracks.
- **Keyboard:** documented shortcuts (e.g. `Space` play/pause, `Enter` advance when allowed); focus visible on all controls.
- **Reduced motion:** shorter/no transitions on overlays; avoid decorative auto-play motion outside the video itself.

### 6.2 Search and browse

- URL-driven filters (`?city=&amenities=`) for shareability.
- Skeleton loaders; “no results” with guidance to widen filters.

### 6.3 Inquiry

- Multi-step or single-page form with Zod schema aligned to parent `Inquiry` / `Lead` (hotel id, optional room, optional `stepKey`, contact fields, consent checkbox if marketing).
- Rate-limit UX: friendly message when API returns 429.

### 6.4 Hotel dashboard — tour builder

- **Draft vs published:** UI clearly labels mode; preview uses **published snapshot** or explicit “preview draft” endpoint (backend contract — frontend must not mix streams accidentally).
- **Reorder:** accessible list (keyboard + pointer); optimistic UI with rollback on failure.
- **Concurrency:** surface version conflict if parent optimistic locking returns 409.

### 6.5 Media uploads

- Progress, retry, and states aligned with parent pipeline: `uploaded` → `processing` → `ready` | `failed`.
- Failed row shows **actionable** copy tied to parent spec (codec, size, duration).

## 7. Accessibility and quality bar

Minimum **WCAG 2.2 AA** intent for:

- Color contrast on default theme.
- Focus order in modals (inquiry, cookie consent, tour help).
- **Name, Role, Value** for custom player controls if not native elements.
- Captions support as in parent test scenarios.

**Testing (frontend):**

- **Playwright** e2e: happy-path tour with gated step; keyboard-only path; inquiry submit.
- **Vitest + React Testing Library** for state machine transitions and manifest validation edge cases.

## 8. Phased delivery (frontend-only), mapped to parent

### FE-A — Skeleton + design system (maps to parent Phase A)

- App shell, typography scale, grid, buttons, inputs, cards — **no business logic** beyond static layout.
- Implement browse + hotel + room **shells** with mock data.

### FE-B — TourPlayer MVP (maps to parent Phase B)

- One seeded hotel; manifest from API or static JSON in repo **only for demo** (replace with API before pilot).
- Implement gating, captions hook-up, token refresh stub or real endpoint.

### FE-C — Dashboard + builder (maps to parent Phase C)

- Hotel layout, tour list, step editor, media library page, publish flow, conflict handling.

### FE-D — Growth UI (maps to parent Phase D)

- Shortlists, saved searches, email capture components, optional assistant panel shell (empty state until backend exists).

## 9. Suggested repository structure (when implementation starts)

Placeholder — adjust to monorepo vs single app decision later.

- `app/(guest)/...` — guest routes
- `app/(dashboard)/...` — hotel routes with shared layout
- `components/tour-player/` — player, overlays, captions
- `components/marketing/` — landing sections
- `lib/api/` — typed fetchers + Zod parsers for manifests
- `lib/i18n/` — reserved for future copy extraction

## 10. Frontend acceptance checklist (subset of parent tests)

Derived from parent **Test scenarios** — frontend must prove:

- Gated step cannot be skipped without user action.
- Captions render and can be toggled; at least one locale path works.
- Keyboard-only completion of a short tour path.
- Room switch loads correct manifest without stale overlay text (“flash” mitigated).
- Mid-tour token refresh does not reset step incorrectly (or shows recoverable error).
- Tour builder: publish creates visible guest change; draft edits invisible until publish.
- Inquiry: client + server validation; 429/5xx graceful UI.

## 11. Open questions (frontend — resolve with product/backend)

1. **Fullscreen tour vs embedded inline** on hotel page (affects layout + mobile UX).
2. **Guest accounts** in v1 or anonymous inquiry only (affects `/auth` scope).
3. **Admin app** same Next.js instance vs separate deploy (security vs velocity).

---

## Implementation todos (frontend)

Use these as the working checklist for frontend execution (parent todos `pick-styling-stack` and `scaffold-web` overlap).

1. **fe-stack-adr** — Record styling stack choice + theme token strategy (ADR).
2. **fe-design-system** — Base layout, type scale, color modes (light/dark optional), core components.
3. **fe-routes-shells** — Guest route tree with loading/error boundaries.
4. **fe-tour-player** — State machine, overlays, captions, keyboard, reduced motion, token refresh.
5. **fe-search-browse** — Filters + URL sync + skeleton/empty states.
6. **fe-inquiry** — Form + success page + error mapping.
7. **fe-dashboard** — Hotel shell + tours list + tour editor + media status UI.
8. **fe-tests** — Playwright smoke + RTL unit tests for TourPlayer core paths.