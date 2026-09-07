# Theme system (`core/theme/`)

Read this before touching colours or theming anywhere in the frontend.

## TL;DR rules

1. **Never write a raw colour** (`#hex`, `rgb()`, `hsl()`, or a named colour like `red`) in a component, inline style, or stylesheet. Use a token:
   - `var(--c-…)` — a **semantic** token (preferred: `--c-text`, `--c-surface`, `--c-primary`, …).
   - `var(--p-…)` — a **palette** primitive, only when no semantic token fits.
2. **The only file allowed to contain literal colours is `primitives.css`.** If you need a new hue, add it there first, then reference it.
3. Structural `black` / `white` / `transparent` (shadows, scrims, overlays) are allowed anywhere.
4. Colours must adapt to light/dark automatically. If you're reaching for a hardcoded colour "just for dark mode", you're doing it wrong — pick the right `--c-*` token.
5. `task frontend:lint:colors` enforces rules 1–3 **inside `core/theme/`** (see [Linter](#linter)).

## Files

| File | Role |
|---|---|
| `primitives.css` | **The palette.** 41 literal colours (`--p-*`) — one neutral ramp (`--p-gray-*` light, `--p-zinc-*` dark) + status hues (blue/green/amber/red). The ONLY place literals live. |
| `colors.css` | **Semantic tokens** (`--c-*`), mapped from primitives per theme. This is what you should reference. |
| `dimensions.css` | Non-colour tokens: spacing, radius, z-index, type, motion. |
| `index.css` | Barrel that `@import`s the above. Imported by `ThemeProvider` (and Storybook). |
| `mantineTheme.ts` | Mantine theme object wiring. |

The old `compat.css` legacy-alias layer has been removed — every component now references `--c-*` directly. Two **legacy** colour files still exist outside this folder and are being phased out — prefer `--c-*` over their tokens, and don't add to them:
`core/styles/theme.css` (editor `--bg-*`/`--text-*` vocab) and `core/tokens/tokens.css` (SUI `--color-*` vocab, gradients, code palette).

## Semantic tokens (`--c-*`)

Reference these, not primitives, wherever possible:

- **Surfaces (elevation):** `--c-bg` (canvas) < `--c-bg-raised` (sidebars/toolbars) < `--c-surface` (cards/modals) < `--c-surface-raised` < `--c-surface-sunken`; plus `--c-input-bg`, `--c-hover`, `--c-active`, `--c-overlay`.
- **Text:** `--c-text`, `--c-text-muted`, `--c-text-subtle`, `--c-text-on-primary` (foreground on a filled primary).
- **Borders:** `--c-border`, `--c-border-subtle`, `--c-border-strong`.
- **Accent:** `--c-primary`, `--c-primary-hover`, `--c-primary-subtle`, and `--c-accent-fg` (see below).
- **Status:** `--c-success`, `--c-danger`.

## Theme model

The **mode** and the **accent colour** are independent.

- `preferences.theme` is the mode: `light` | `dark` | `system` (System follows the OS). There is no separate "custom" or "midnight" mode any more.
- Light and dark each have their **own accent**: `preferences.lightPrimary` / `preferences.darkPrimary` (both default `#3b82f6` blue).
- `ThemeProvider` resolves the mode to a concrete `light`/`dark` base, picks that side's accent, and **always** sets `data-app-theme="custom"` on `<html>`. So the custom-tint blocks in `colors.css` are the only themed blocks that apply — the chosen accent drives every accent **and** a subtle app-wide surface tint. With the default blue the tint is near-neutral.
- Selection attributes on `<html>`: `data-theme` = `light|dark` (SUI + the tint blocks), `data-mantine-color-scheme` = `light|dark` (Mantine).

### Custom-theme contrast guardrails (`core/utils/customPrimary.ts`)

Because the accent is user-chosen, `deriveAccessiblePrimary(pick, base)` clamps it and injects three vars on `<html>`:

- `--user-primary` → `--c-primary`. Lightness-clamped so it can't collapse into the base (dark floor `L ≥ 0.42`, light ceil `L ≤ 0.6`). Used for **fills**.
- `--user-primary-on` → `--c-text-on-primary`. White by default; flips to **black only for genuinely light picks** (relative-luminance cutoff `0.62`, so saturated amber/green/cyan keep white text).
- `--user-accent-fg` → `--c-accent-fg`. The accent tuned as a **foreground** (text/icon on the app surface): forced light on dark bases (`L ≥ 0.62`), dark on light (`L ≤ 0.45`), so accent text never goes dark-on-dark.

**Rule of thumb:** a filled control's background uses `--c-primary` with its label on `--c-text-on-primary`; an accent used **as text/icon on a surface** (nav selection, links, tool-header text) uses `--c-accent-fg`. Reference it as `var(--c-accent-fg, var(--c-primary))` — the fallback keeps non-custom builds (where `--c-accent-fg` is unset) on the raw primary.

The FAB / logo mark is a deliberate exception: it's pinned to white (`--p-white`), not the on-primary flip — a brand mark, not body text.

## Linter

One file: `editor/scripts/lint/theme-lint.mjs` (no baseline). Run via `task frontend:lint:colors` (part of `task frontend:lint`).

- **Default (blocking):** enforces "literals only in `primitives.css`; everything else in `core/theme/` references tokens; no duplicate primitives." Scope is deliberately just `core/theme/` — the layer this owns, which is clean.
- **`node theme-lint.mjs contrast`** (task `frontend:contrast`, non-blocking): WCAG contrast report for text-on-surface / on-primary pairs per theme.

App-wide "no hardcoded colours in components" is **not** enforced yet (there are 260+ legacy sites); that's a separate migration. Don't add new hardcoded colours regardless.

## Gotchas

- **`--mantine-*` vars are consumed by Mantine at runtime**, not via our `var()`. A source scan can't see their use — never delete them as "unused", and set them (not raw colours) when overriding Mantine.
- **`--accent-*` (categorical hues) are used dynamically** via `` `var(--accent-${hue})` `` in `utils/accentColors.ts`. A literal search won't find them — don't treat them as unused.
- **Tailwind consumes some vars** (`--gray-*`, `--color-*`, `--background`, `--border`) via `editor/tailwind.config.js` using `rgb(var(--x))`. That file is outside the usual scan roots — check it before removing those.
- **Specificity:** if a token you set in `colors.css` (`html[data-app-theme="custom"]`, 0,1,1) isn't winning, a `:root:root` or a `[data-mantine-color-scheme]`-compound block in the legacy files is probably overriding it — set it in the more specific block.
- **Adding a colour:** put the literal in `primitives.css`, map it to a `--c-*` in `colors.css` if it's a new semantic role, and reference the `--c-*` from components. Don't skip straight to a `--p-*` in a component unless there's genuinely no semantic fit.
