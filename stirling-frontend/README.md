# Stirling frontend

A Vite + React 18 + TypeScript scaffold lifted from the `stirling-dev-portal.html` prototype. Three things ship in this repo:

1. **Typed design tokens** — light + dark colour palettes, an always-dark code palette, gradients, shadows, radii, typography and motion. Available both as a TypeScript module (`src/tokens/tokens.ts`) and as CSS custom properties (`src/tokens/tokens.css`). Theme switching flips `data-theme` on `<html>`.
2. **Typed data catalogues** — every endpoint (`src/data/endpoints.ts`) and every operation (`src/data/ops.ts`) from the prototype, lifted into immutable TypeScript constants. The endpoint catalogue carries route path, tier gate, JSON-shape schema, region availability and vertical accent for ~60 endpoints across 10 verticals. The op library carries the canonical 6-stage pipeline taxonomy (`PIPELINE_OPS`), the wider 100+-op library (`LIBRARY_OPS`), the pre-bundled one-click agents, and the source/destination rail options.
3. **Component primitives** — `Button`, `StatusBadge`, `MethodBadge`, `ToggleSwitch`, `ProgressBar`, `MetricCard`, `NavItem`, `PanelHeader`, `CodeBlock`, `SectionDivider`, `Card`. Each has its own CSS file referencing tokens via `var(--...)`, and each has a Storybook story exercising the variants.

## Quickstart

```bash
pnpm install            # or npm install
pnpm dev                # Vite dev server — runs src/App.tsx as a smoke test
pnpm storybook          # Component explorer at http://localhost:6006
pnpm build              # Type-check + Vite production build
pnpm typecheck          # Just tsc --noEmit
```

If you prefer npm or yarn the same scripts apply — they just call the underlying tools.

## Layout

```
stirling-frontend/
├── index.html                          # Vite entry
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .storybook/
│   ├── main.ts                          # Storybook config (vite, addons)
│   └── preview.ts                       # Theme decorator + tier toolbar
└── src/
    ├── main.tsx                         # React root
    ├── App.tsx                          # Smoke-test surface (delete when ViewRouter lands)
    ├── tokens/
    │   ├── tokens.ts                    # COLORS_LIGHT, COLORS_DARK, CODE, GRADIENTS, SHADOWS, RADII, TYPE, MOTION, palette()
    │   ├── tokens.css                   # CSS custom properties, keyframes, prefers-reduced-motion
    │   ├── base.css                     # Minimal reset + base typography
    │   └── Tokens.stories.tsx           # Live swatch grid + typography + motion preview
    ├── data/
    │   ├── endpoints.ts                 # Endpoint, Vertical, VERTICALS, ALL_ENDPOINTS, lookupEndpoint, isEndpointAvailable
    │   ├── ops.ts                       # PIPELINE_OPS, LIBRARY_OPS, PIPELINE_AGENTS, OP_CATEGORIES, SOURCE_OPTIONS, DESTINATION_OPTIONS
    │   ├── Endpoints.stories.tsx        # Vertical-grouped endpoint browser
    │   └── Ops.stories.tsx              # Stage-grouped + category-grouped op browsers
    └── components/
        ├── Button.{tsx,css,stories.tsx}
        ├── StatusBadge.{tsx,css,stories.tsx}
        ├── MethodBadge.{tsx,css,stories.tsx}
        ├── ToggleSwitch.{tsx,css,stories.tsx}
        ├── ProgressBar.{tsx,css,stories.tsx}
        ├── MetricCard.{tsx,css,stories.tsx}
        ├── NavItem.{tsx,css,stories.tsx}
        ├── PanelHeader.{tsx,css,stories.tsx}
        ├── CodeBlock.{tsx,css,stories.tsx}
        ├── SectionDivider.{tsx,css}
        ├── Card.{tsx,css,stories.tsx}
        └── index.ts
```

## Theme switching

The runtime contract: set `data-theme="dark"` (or `"light"`) on `<html>`. Every component reads colours via CSS custom properties, so flipping the attribute cascades everywhere without re-renders.

```ts
function setTheme(mode: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', mode);
}
```

The `Tokens.stories.tsx` swatch grid renders against whatever theme Storybook's toolbar has selected, so designers can preview both modes side-by-side without code changes.

## Tier system

`Tier` (`'free' | 'pro' | 'enterprise'`) lives in `tokens.ts` and is the single shared definition. The endpoint helper `isEndpointAvailable(endpoint, tier)` already implements the gate logic. When the app shell lands, wrap it in a `useTier()` hook rather than threading the value through every component prop. Storybook's `tier` global toolbar (see `.storybook/preview.ts`) is set up to feed the right value in.

## Extending

**Add a new endpoint.** Append to the appropriate vertical array in `src/data/endpoints.ts`. `ALL_ENDPOINTS` and `ENDPOINTS_BY_PATH` rebuild automatically.

**Add a new op.** For pipeline-stage ops, add to the appropriate stage in `PIPELINE_OPS`. For the wider library, append to `LIBRARY_OPS` with the right `kind` and `category`. `PIPELINE_OPS_INDEX` and `LIBRARY_OPS_INDEX` rebuild automatically.

**Add a new primitive.** Drop a new folder `src/components/X/` with `X.tsx`, `X.css`, and `X.stories.tsx`, then re-export from `src/components/index.ts`. Use CSS custom properties for every colour — no hardcoded hexes outside the token files.

**Add a new theme.** Open `tokens.ts`, add a new `ColorPalette` constant, and a parallel block to `tokens.css` under a new `[data-theme="..."]` selector. The component primitives don't care which theme is active.

## Conventions

- All colour references in component CSS go through `var(--color-...)` — never hardcode hex except inside `tokens.ts` / `tokens.css`.
- Category accents are theme-stable on purpose. Don't put them in the dark-mode override block.
- The `CODE` palette is also theme-stable. Code blocks stay dark in both modes (Stripe / Vercel pattern).
- `prefers-reduced-motion` is respected globally; do not author animations that ignore it.
- Components expose a `className` prop for callers to extend styles. Do not pass inline styles for colour overrides — add a prop and a CSS class instead.

## Not included yet

- App shell (Sidebar, Header, ViewRouter)
- Floating Assistant widget
- Icons — the prototype uses a Lucide-style sprite under `Icon.*`; recommendation is to depend on `lucide-react` directly rather than re-implementing.
- Charts — pull in Recharts when the UsageAreaChart and DashboardAreaChart surfaces land.
- The Mock layer (MSW) — drop in handlers keyed off `ALL_ENDPOINTS` so the data shapes here drive the fake API for free.
- The view surfaces themselves (Home, Pipelines, Sources, Documents, Infrastructure, …) — see Section 9 of `Stirling_Frontend_Breakdown.docx` for the staging plan.
