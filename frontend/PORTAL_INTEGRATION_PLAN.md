# Portal ↔ Editor integration plan

> **TL;DR.** The portal (`src/portal/`) and the editor (`src/core/`) are two React apps in one repo, each with its own design system, theme, and primitives. Long-term they need to share *something* — the open question is *what* and *when*. This doc captures the analysis, the recommended path (token unification first, primitive sharing later, composer last), and a phased sequence so we don't sleepwalk into either of the bad outcomes (forever-duplication or a premature shared-design-system rewrite).

---

## 1. Status snapshot

- **Editor** lives at `frontend/src/core/`. Mantine UI + Tailwind 4 + MUI icons, 162 components, 54 tools, 35 contexts, 48 services, ~17-deep provider tree, FileContext-based state with PDF.js lifecycle management.
- **Portal** lives at `frontend/src/portal/`. Custom `sui-*` design system in `frontend/src/shared/`, ~30 primitives, react-router-dom, MSW for mocked data, async `api/*` layer, much simpler state (Theme/Tier/UI/View contexts).
- **No cross-imports today.** The editor has never imported from `@shared/*`. Storybook is portal-only.
- Both apps build cleanly in parallel from the same `frontend/` package (`task frontend:build` for the editor, `task frontend:build:portal` for the portal). Same `node_modules`, separate Vite modes, separate `dist/` outputs.

The two apps will eventually need to **look like the same product** (shared brand colours, spacing, motion) and **share some logic** (most likely a Pipelines / Automate composer). They do **not** need to share their whole UI library — Mantine in the editor is fine and the sui-* design system in the portal is fine.

---

## 2. The actual problem (what this plan exists to solve)

The two codebases use **conflicting CSS variable schemes** for the same concepts:

| Concept | Editor (`core/styles/theme.css`) | Portal (`shared/tokens/tokens.css`) |
|---|---|---|
| Colour scale | `--color-primary-50…900` (numeric, Tailwind-style) | `--color-blue / -light / -border / -dark` (named) |
| Surfaces | `--bg-surface`, `--text-primary`, `--border-default` | `--color-bg`, `--color-surface`, `--color-text-1…5`, `--color-border` |
| Spacing | `--space-xs/sm/md/lg/xl` (T-shirt) | `--space-0/1/2/3/4/5/6/8/10/12` (numeric) |
| Radii | `--radius-xs/sm/md/lg/xl` (5 keys) | `--radius-xs/sm/md/lg/xl/pill` (6 keys, partially overlapping values) |
| Shadows | `--shadow-xs/sm/md/lg/xl` | `--shadow-sm/md/lg` + `--shadow-blue/-blue-hover` |
| Z-index | `--z-fullscreen-surface: 1200`, ad-hoc constants | `--z-base/sticky/dropdown/drawer/modal/toast` (hierarchy) |
| Category accents | `--category-color-removal/security/formatting/…` (tool categories) | `--color-cat-insurance/compliance/finance/…` (document verticals) |

These will collide if both stylesheets ever load in the same DOM. They don't today (separate Vite builds, separate dist) — but the moment we share a primitive or build a unified surface, they will.

**The cost of fixing this later compounds.** Every new sui-* primitive references 3–5 tokens. Every new editor component does the same. Today there are ~30 primitives × ~5 refs = ~150 token touchpoints in the portal. Sources + Documents + Infrastructure + remaining Pipelines work will roughly double that. Reconciling 300+ token references across two apps is dramatically more painful than reconciling 150.

**The cost of fixing this *now* is bounded.** It's a one-time pass that adds aliases in the editor's `theme.css` to bridge the two schemes. Editor doesn't visually change. Portal doesn't visually change. Future tokens added on either side go through the shared file by default.

---

## 3. Paths considered

### Path A — Strict isolation
Two design systems forever. New work in each app stays in its own UI library. Never share. **Verdict: rejected.** It abandons the original "share components" goal, accumulates brand drift, and duplicates effort indefinitely.

### Path B — Editor migrates to sui-*
Rewrite the editor's 162 Mantine-themed components to use sui-* primitives instead. **Verdict: rejected.** Multi-month rewrite. Loses Mantine's accessibility primitives. Visually destabilises the editor for a long period for no near-term user benefit. No editor consumer is asking for this.

### Path C — Token unification + selective primitive sharing
Make sui-tokens the brand contract. Both apps read from it; both keep their own UI libraries. Extract sui-* primitives into shared use only when the editor genuinely needs one. **Verdict: recommended.** Lowest risk, highest leverage, additive. Captures the brand consistency benefit (the visible payoff) without requiring either app to rebuild itself.

### Path D — sui-* wraps Mantine
Reimplement sui-Button etc. to internally render Mantine. **Verdict: rejected.** Heavy rewrite of work we just shipped. Adds ~150KB Mantine to the portal bundle. Changes the portal's visual signature. Mantine peer-deps would also need to flow into the shared layer, which violates the package-extractability we built into sui-*.

---

## 4. Phased plan

### Phase 1 — Token reconciliation
**Priority: highest. Importance of doing early: ★★★★★. Estimated effort: 1–2 days.**

This is the only phase that genuinely benefits from being done early. Everything else can wait until there's pull from a real consumer.

#### Scope

1. Move sui-tokens to be the *brand source of truth*. Right now they live at `frontend/src/shared/tokens/tokens.css` (CSS) and `tokens.ts` (TypeScript mirror). They stay there. Both apps load them.
2. In `frontend/src/core/styles/theme.css`, **add alias declarations** that map editor-scheme variables to sui-token variables:
   - `--color-primary-500: var(--color-blue);`
   - `--color-primary-100: var(--color-blue-light);`
   - `--space-md: var(--space-4);`
   - `--shadow-md: var(--shadow-md);` (already aligned; just ensure both define same value)
   - `--bg-surface: var(--color-surface);`
   - `--text-primary: var(--color-text-1);`
   - …continued in Appendix A.
3. Editor's `mantineTheme.ts` then resolves through these aliases automatically because it already reads from CSS variables — no Mantine theme changes needed.
4. Pure-token category colours: reconcile `--category-color-*` (tool categories in editor) and `--color-cat-*` (document verticals in portal). They serve different purposes — keep both, just colocate them in the shared tokens file.

#### Acceptance criteria

- [ ] sui-tokens.css is imported by both `src/portal/main.tsx` and `src/index.tsx` (editor entry).
- [ ] Editor's `theme.css` is reduced to alias declarations + editor-only tokens (compare/file-active/etc.) — no duplicated colour palette.
- [ ] `task frontend:build` (editor) and `task frontend:build:portal` both succeed.
- [ ] Editor's existing screens are visually identical (manual smoke test of HomePage, a tool, the settings modal).
- [ ] Portal's existing screens are visually identical (manual smoke test of Home, Pipelines, the composer modal).
- [ ] A pull request that changes a sui-token (e.g. `--color-blue: #3B82F6 → #4F8AF4`) propagates to both apps without any other file changes.

#### Risk

- **Tailwind preflight order** — Tailwind 4 in the editor sets resets globally. Need to ensure sui-tokens load before Tailwind base so the editor's existing imports order still works.
- **Mantine's own `--mantine-color-*` variables** — left alone; Mantine remaps internally, we don't touch its namespace.
- **Hard-coded hex values in editor CSS modules** — there will be some; flag during the pass, leave them for a separate sweep rather than blocking.

#### Rollback

Revert the changes to `theme.css` and the imports. Tokens stay in shared (no breakage). Editor falls back to its old colour values.

---

### Phase 2 — Portable primitive extraction
**Priority: deferred. Importance of doing early: ★★☆☆☆. Estimated effort: 1–2 days per primitive when pulled.**

Portable = uses no application context, no api/* layer, no router. Roughly: `Stack`, `Inline`, `Skeleton`, `Spinner`, `Banner`, `EmptyState`, `Chip`.

These are safe for the editor to consume from `@shared/*` — they're presentational, theme-aware, and have no dependencies on portal-side providers.

#### When to do this

When the editor has a *concrete consumer* for one of these. Not before. The current editor team is not asking for them; pulling them in pre-emptively risks an API mismatch when a real consumer materialises.

#### Trigger conditions

- A new editor component is about to reimplement a shimmer skeleton → instead, import `Skeleton` from `@shared/components`.
- A new editor screen needs a "you're all caught up" state → import `EmptyState`.
- An editor maintainer asks "is there a shared X?" → answer yes if it's in the portable subset, no otherwise.

#### Scope per primitive

1. Verify the primitive doesn't depend on any portal-only context. (It shouldn't — these were built without provider coupling, but double-check.)
2. Add the primitive to a `@shared/components` re-export allowlist that the editor's ESLint config permits.
3. Editor imports `import { Skeleton } from "@shared/components"`.
4. Add an editor-specific story for it under `src/core/components/.../Skeleton.stories.tsx` if useful (or accept the existing portal story covers the demo cases).

#### Explicitly NOT portable

- `Modal`, `Drawer`, `Dropdown`, `Tabs` — editor uses Mantine equivalents for a11y + behaviour. Don't double up.
- Form primitives (`Input`, `Select`, `Checkbox`, `Radio`, `Slider`, `FormField`) — Mantine's are more featureful and already themed.
- `Toast` — editor uses Mantine's Notification system + BannerContext. Don't double up.
- `Button`, `Card` — editor's Mantine `Button` has a `pdfTool` variant and lots of internal customization. Sui-* versions are visually different.

#### ESLint enforcement

Add to `frontend/eslint.config.mjs`:

```js
// In the src/core/** rules block:
"no-restricted-imports": [
  "error",
  {
    patterns: [
      ...baseRestrictedImportPatterns,
      {
        regex: "^@shared/components/(Modal|Drawer|Dropdown|Tabs|Button|Card|Input|Select|Checkbox|Radio|Slider|FormField|Toast)",
        message: "Editor uses Mantine for these primitives. Keep sui-* in the portal.",
      },
    ],
  },
],
```

(Tokens, layout primitives, and presentational atoms remain freely importable.)

---

### Phase 3 — Pipelines composer as the shared surface
**Priority: deferred until concrete need. Importance of doing early: ★☆☆☆☆. Estimated effort: 1–2 weeks when pulled.**

The HANDOFF doc flagged the Pipelines composer as the eventual shared surface between portal (developer-facing pipeline builder) and editor (Automate tool building automated workflows on uploaded files).

Both apps need the same thing: an op-chain UI where the user picks operations, configures them, and reorders them.

#### When to do this

When the editor's `Automate.tsx` tool needs to upgrade from its current implementation, *or* when a customer asks for the same composer in both apps. Not before.

#### Architecture sketch

When the trigger fires:
- Extract `PipelineComposer` + `PipelineOpChain` from `src/portal/components/` into a new home — most likely `src/shared/composer/` if it's small, or `frontend/packages/composer/` if it's substantial enough to want its own build target.
- Split into two layers:
  - **Composer** (shared): the UI for picking ops, reordering, expanding for inline config.
  - **Runtime** (per-app): how the resulting draft is executed. Portal uses MSW + `deployPipeline`. Editor uses `useToolOperation` against real files.
- The shared composer takes a "available ops" prop (catalogue) and an `onDeploy` callback. Both apps supply their own.

#### What NOT to share

- `FileContext` and the editor's PDF.js lifecycle — editor-domain.
- `useToolOperation` and the editor's tool execution machinery — editor-domain.
- The portal's MSW handlers — portal-domain.

---

### Phase 4 — Drift prevention (ongoing)
**Priority: ongoing. Importance of doing early: ★★★☆☆.**

#### Document the boundary in `CLAUDE.md` (and probably `AGENTS.md`)

Add a section explaining:
- `frontend/src/shared/` is the brand contract. Tokens + portable primitives only.
- Editor (`src/core/*`) uses Mantine for stateful/interactive primitives.
- Portal (`src/portal/*`) uses sui-* primitives.
- The shared layer must not import from either app; either app may import tokens; neither app should import the other's primitives.

#### Storybook organisation

- Currently Storybook only sees `src/portal/**` and `src/shared/**`. That's correct.
- If/when editor primitives also get stories, register them in a separate Storybook config (or namespace them clearly: `Editor/...` vs `Portal/...`).

#### Add a CI check

When the token reconciliation lands, add a CI check that fails if a new `--color-*` or `--space-*` variable is declared anywhere outside `src/shared/tokens/`. Simple grep, prevents drift.

---

## 5. Sequencing recommendation

```
NOW (this PR cycle)
└── Finish current portal feature work → ship the PR

NEXT (immediately after PR merges, before more portal features)
└── Phase 1: Token reconciliation  ← THIS IS THE LOAD-BEARING DECISION

ONGOING (in parallel with portal feature work)
├── Sources view  (Phase 5 of BREAKDOWN.md)
├── Documents view  (Phase 6)
├── Infrastructure view  (Phase 7)
└── Editor placeholder, Eval workbench, etc.

ON-DEMAND (when a real consumer pulls)
├── Phase 2: Extract a portable primitive into editor use
└── Phase 3: Pipelines composer if Automate needs it

ALWAYS-ON
└── Phase 4: Drift prevention (CLAUDE.md update + lint rule + CI grep)
```

The critical insight: **everything except Phase 1 has a natural trigger**. Phase 2 happens when an editor component would otherwise duplicate a primitive. Phase 3 happens when Automate needs the composer. Phase 4 is just enforcing the rule we already wrote down.

Phase 1 has **no natural trigger** — nothing forces it. So if we don't schedule it, it doesn't happen, and the drift compounds.

---

## 6. Risks log

| Risk | Severity | Mitigation |
|---|---|---|
| Tailwind preflight in editor resets sui-* button styles if a sui-* primitive lands in the editor | High | Don't share Button until Tailwind config is shown to coexist. Address in Phase 2 review per primitive. |
| Mantine global CSS (`@mantine/core/styles.css`) sets `--mantine-color-*` etc. | Low | Doesn't conflict with sui-* namespace. Already proven to coexist with editor's `theme.css`. |
| Token reconciliation breaks the editor visually | Medium | Phase 1 is alias-only — no value changes in editor. Smoke test before merge. Rollback is a one-file revert. |
| Token reconciliation breaks the portal visually | Low | Portal continues reading the same sui-* tokens it already uses. No change unless someone changes a value. |
| Editor adds new tokens that conflict with shared (e.g. another `--shadow-md`) | Medium | After Phase 1, add CI check (Phase 4) that fails if `--color-*`/`--space-*`/`--shadow-*` are declared outside the shared file. |
| Editor team wants a sui-* primitive we said wasn't portable | Medium | Discuss per-case. Likely answer is "no, use Mantine"; if there's a genuine need, build a thin wrapper rather than promoting the primitive. |
| Composer extraction lands before the editor needs it → wrong API | High | Don't extract Phase 3 speculatively. Wait for the editor's Automate tool to actually request it. |
| Two designers (or design tools) producing diverging brand directions | High but cultural | Out of scope of this doc. Token unification at least gives one place to look. |

---

## 7. What this plan deliberately does NOT do

- **Does not migrate the editor away from Mantine.** Mantine is fine. The editor's investment in it is enormous and removing it has no near-term payoff.
- **Does not adopt Mantine in the portal.** The portal's sui-* design system is intentional and shipping. Adding Mantine doubles the UI library footprint and changes the visual signature.
- **Does not centralise file handling.** `FileContext`, `useToolOperation`, the PDF.js lifecycle manager — these are editor-domain and stay there.
- **Does not centralise API conventions.** Editor uses `apiClient` (axios-ish). Portal uses `httpJson` (fetch + MSW). Both are fine; consolidation is a separate decision for when the portal hits a real backend.
- **Does not unify routing.** Both are on react-router-dom v7; their route trees are independent; that's correct.
- **Does not propose a monorepo restructure** (`apps/editor/`, `apps/portal/`, `packages/*`). The current `src/core/` + `src/portal/` + `src/shared/` setup is working. Only revisit if/when external consumers need to install a published package.

---

## 8. Open questions worth answering before Phase 1 starts

1. **Which colour scale survives?** Editor's `--color-primary-50…900` (Tailwind-friendly, supports gradients) vs portal's `--color-blue / -light / -border / -dark` (semantic, easier to read in CSS). Recommendation: shared file exposes BOTH, with aliases between them, so neither side has to change its existing references. Editor reads `--color-primary-500`; portal reads `--color-blue`; both resolve to the same hex.
2. **Spacing scale**: T-shirt vs numeric. Recommendation: shared file exposes both, with `--space-md → --space-4` alias.
3. **Category colours**: keep both `--category-color-*` (editor tool categories) and `--color-cat-*` (portal document verticals). They serve different products. Co-locate, don't merge.
4. **Dark mode parity**: editor and portal both have a dark theme. Are they visually identical or do they differ on purpose? If they differ — which one wins for shared surfaces? Recommendation: portal's dark palette becomes canonical (it was built more recently with intent) and editor adopts where they conflict.
5. **Code palette (always-dark)**: portal's `--code-*` is intentionally never theme-switched. Editor doesn't have a comparable convention. Recommendation: shared file owns the code palette; editor inherits it.

---

## 9. Appendix A — Token name mapping (Phase 1 reference)

When Phase 1 happens, this is the authoritative mapping. Editor's `theme.css` adds aliases for these so existing editor CSS keeps working unchanged.

```css
/* Colour scale */
--color-primary-50:  var(--color-blue-light);    /* #eff6ff */
--color-primary-100: /* keep editor value — sui doesn't expose 100 directly */
--color-primary-500: var(--color-blue);          /* #3B82F6 */
--color-primary-600: var(--color-blue-dark);     /* #2563eb */
/* …rest of the 50-900 scale: introduce 200/300/400/700/800/900 into shared
   if we want them available for portal use, OR keep them editor-local. */

/* Surfaces (semantic → portal-style) */
--bg-surface:      var(--color-surface);
--bg-muted:        var(--color-bg-muted);
--text-primary:    var(--color-text-1);
--text-secondary:  var(--color-text-3);
--text-muted:      var(--color-text-5);
--border-default:  var(--color-border-input);
--border-subtle:   var(--color-border-light);
--hover-bg:        var(--color-bg-hover);

/* Spacing (T-shirt → numeric) */
--space-xs: var(--space-1);
--space-sm: var(--space-2);
--space-md: var(--space-4);
--space-lg: var(--space-5);
--space-xl: var(--space-6);

/* Radii — both use xs/sm/md/lg/xl, values likely already aligned. Audit; if
   values differ, pick the portal values (they were chosen more recently). */

/* Shadows — values likely already aligned. Audit similarly. */
```

---

## 10. Appendix B — Why this isn't urgent enough to interrupt the current PR

- The portal builds independently. The editor builds independently. Neither blocks the other today.
- No customer is impacted by the tokens being misaligned — both apps are pre-launch (portal) or have their own existing brand (editor).
- The cost of waiting one PR cycle is small — ~1 PR's worth of new token references (handful, not dozens).
- The cost of doing Phase 1 mid-PR would be larger — context-switch, merge conflicts, risk of derailing the current scope.

So: ship the current PR, then Phase 1 immediately after, before adding more sui-* primitives or more editor token references.

---

## Revision history

- **2026-05-18** — Initial draft. Captures Path C recommendation and 4-phase sequencing.
