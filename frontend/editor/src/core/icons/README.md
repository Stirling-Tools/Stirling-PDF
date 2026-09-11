# Icon system (`core/icons/`)

Read this before adding, changing or styling any icon.

## TL;DR rules

1. **Render every icon with `<Icon name="…" />`** from `@app/ui/Icon`. There is one icon component and one icon set.
2. **Never write an `<svg>` in a `.ts`/`.tsx` file.** Icons are `.svg` files under `svg/stirling/` or `svg/third-party/`. Geometry computed at runtime (charts, overlays, previews) is the only exception and needs a `// icon-lint-disable -- <reason>` comment.
3. **Size with the `size` prop, never `fontSize`.** The old icons were font glyphs; `<Icon>` sizes via `width`/`height`, so `style={{ fontSize }}` does nothing at all.
4. **A name has to be in `icons.ts`.** Adding one is two lines: the `?react` import and the map entry. `IconName` comes from that map, so anything missing is a compile error.
5. `task frontend:lint:icons` enforces 1–3 (see [Linter](#linter)).

## The standard

**Lucide**, rendered at **stroke width 1.75** — the weight the processor chrome was drawn at. Every monochrome icon inherits colour from `currentColor`, so it themes automatically.

`icons.ts` maps a name to the component `?react` compiles from its svg, and `IconName` is `keyof` that map, so an unknown name is a compile error at the call site rather than a placeholder someone notices in production. Browse the set in Storybook under **Icons/Registry**: *In use* is what the app renders today, *All icons* is everything the map accepts.

One `--c-*` note: colour icons the same way you colour text. `<Icon name="x" style={{ color: "var(--c-danger)" }} />`, not a `fill`.

## Filled and colourless states

Two props cover the cases one outline glyph cannot:

- **`filled`** paints a mono icon with `currentColor` instead of `fill="none"`. Use it for the on state of a toggle whose off state is the same outline, so favourited/pinned reads at a glance: `<Icon name="star" filled={isFavorite} />`. Only meaningful on a closed shape; on `pin` the open needle line stays a stroke, which is what you want.
- **`colorless`** greys out a brand mark, for a source that is off or unavailable (the Google Drive entry in the file-source list). It is a css filter rather than a recolour, so the mark keeps the artwork its owner published and greyscale maps luminance, leaving a multi-plane mark like Drive's legible instead of flattening it to a silhouette. The rules live in `colorless.css`.

Neither is a styling escape hatch: reach for `filled` only where the outline already carries the off state, and `colorless` only where a brand colour would be the odd one out in a list.

## Files

The component lives with the other shared primitives, in `core/ui/Icon.tsx` — import it from `@app/ui/Icon`, the same way you import `@app/ui/Button`. This folder holds the icon sources and the map that names them.

| File | Role |
|---|---|
| `core/ui/Icon.tsx` | The only icon component, plus `isIconName()`. Re-exports `IconName`, so `@app/ui/Icon` is the single import. |
| `icons.ts` | Name → component. Every icon the app can render, and the source of `IconName`. |
| `icons.config.ts` | Stroke weight and default size. |
| `colorless.ts` / `colorless.css` | The `colorless` class, for a disabled brand mark. |
| `svg/stirling/*.svg` | Our own drawings, for glyphs lucide has no equivalent for. |
| `svg/third-party/*.svg` | Brand marks (S3, Slack, Jira…), which keep their own colours. |
| `icon-map.json` | Temporary: legacy name → lucide name, for the migration audit story only. |

`?react` compiles each svg into a component at build time, configured once in `editor/scripts/icons/svgrOptions.mts` so the app, Storybook and the tests transform them the same way. Lucide's own svgs are read from `lucide-static` in `node_modules`, so none of its artwork is checked in.

## Adding an icon

**It exists in lucide** — add two lines to `icons.ts`: an import from `lucide-static/icons/<name>.svg?react`, and an entry pointing at it. Check *Icons/Registry → In use* first, so the same idea does not end up drawn two ways.

**It does not exist in lucide** — draw it. Put a kebab-case `.svg` in `svg/stirling/` using lucide's grammar (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, stroke width 1.75, round caps and joins), then add it to `icons.ts`. See `users-plus.svg` or `line-weight.svg`. Draw inside the 2..22 box lucide keeps its glyphs in: nothing rescales our drawings, because a glyph that is small on purpose (a dot, a chevron) would be inflated to fill the box.

**It is a brand mark** — put it in `svg/third-party/`, named after the connector `type`/`kind` the API returns, so `<BrandMark id={type} />` resolves it, and add it to `icons.ts` with `kind: "brand"` so `<Icon>` leaves its colours alone. Brand art arrives on its owner's grid (Drive on 87.3x78, Dropbox on 16x16), so wrap the geometry in a `translate`/`scale` that fits its ink into the middle 20 units of a `0 0 24 24` frame, the way the committed marks do. Keep the owner's path data exactly as published.

## Names that come from data

An icon name is often not a literal: a tool registry entry, a saved automation, a classification label. Type those fields `IconName` rather than `string` — that is what makes the compiler catch a name `icons.ts` does not map.

For a prop that takes *either* a name or your own node, narrow with `isIconName()`. `typeof x === "string"` does not work, because `ReactNode` already includes `string`.

## Linter

`editor/scripts/lint/icon-lint.mts`, run by `task frontend:lint:icons` (part of `task frontend:lint`). Blocking: no inline `<svg>`, no retired icon library, `.svg` only in the icon dirs or `assets/`, and every `<Icon name="…">` literal must resolve.

`task frontend:lint:unused-icons` reports svgs in `svg/stirling/` that nothing renders, each of which is a drawing to keep on style for no reason. It deliberately over-counts references, because a false "unused" gets a live icon deleted.

## Gotchas

- **A css `fill` breaks every icon in its scope.** Stroke icons render with `fill="none"`; a stylesheet fill overrides that presentation attribute and renders them solid. Colour them with `color`. icon-lint blocks this.
- **An unknown name never throws.** `<Icon>` draws a dashed-circle placeholder (`MISSING_ICON`) and, in dev, logs the name once; the svg carries `data-missing-icon` so a screenshot or e2e run can spot it. Seeing it means a typo, or a name from data that `icons.ts` does not map. `task frontend:lint:icons` catches Material Symbols names left in any position, and `isIconName` is the guard for names that arrive from data.
- **`fontSize` is inert on `<Icon>`.** The most likely regression when porting old code: the icon silently renders at the default size. Use `size`.
- **A filled/outline pair is one icon plus `filled`, not two.** MUI shipped `Star` and `StarBorder` as separate glyphs, so a component that rendered both collapsed to one name here. If a legacy diff shows a filled variant, check whether the difference encoded state before treating it as a duplicate.
- **`iconMap.ts` keys are persisted.** A saved automation or watched folder stores `"SettingsIcon"`, so those keys must never be renamed — only their values.
- **The classification label palette is mirrored in the backend** (`app/proprietary/src/main/resources/classification/classification-labels.json`) and a drift test enforces icon parity. Change both sides together.
- **Brand marks look unreferenced.** They resolve from connector ids the API returns, never from literals; the unused report and the gallery's *In use* view both allow for that.
- **No third-party icon artwork is checked in.** `Migration/Icon audit` gets its "before" glyphs from `virtual:legacy-icons`, served straight out of the icon packages by `editor/scripts/icons/legacyIcons.vite.mts`; never commit another icon set's geometry. The audit and everything it needs go once the mapping is signed off.
