# Portal UI conventions — SUI vs Mantine

The portal has two component sources. The rule:

> **Simple, presentational, brand-defining UI → our SUI design system
> (`@shared/components`). Complex, stateful, or accessibility-hard widgets →
> Mantine.** Don't reinvent what Mantine already does well; do own the look of
> the simple, high-frequency pieces.

Both are theme-bound: `MantineProvider` in `App.tsx` is wired to the portal's
`ThemeProvider` (`mantineTheme.ts` maps the brand palette), so Mantine widgets
follow the same light/dark switch and brand colours as SUI. **The provider is
intentional** — it exists precisely so we can drop Mantine widgets in where they
earn their keep.

## Use SUI (`@shared/components`) — our own style
Layout and presentational primitives we want full brand control over and that
are cheap to own:

`Button` · `Card` · `StatusBadge` / `MethodBadge` · `Chip` · `MetricCard` ·
`MetricStrip` · `StatTile` · `ProgressBar` · `Avatar` · `Banner` · `Skeleton` ·
`Spinner` · `EmptyState` · `NavItem` · `PanelHeader` · `SectionDivider` ·
`Stack` / `Inline` · `Table` (static/presentational) · `CodeBlock` ·
`FormField` (label/help/error layout) · simple `Tabs`.

## Use Mantine — don't reinvent
Anything that needs portals, focus traps, ARIA keyboard patterns, or is just a
solved hard problem:

- **Overlays**: `Modal`, `Drawer`, `Popover` (focus trap, scroll lock, escape, focus restore)
- **Menus**: `Menu` (roving arrow-key navigation)
- **Selects**: `Select` / `MultiSelect` / `Combobox` / `Autocomplete` (keyboard + filtering)
- **Dates**: `@mantine/dates` `DatePicker` / `DatePickerInput` (e.g. billing period range)
- **Files**: `@mantine/dropzone` `Dropzone` (connect-source upload, op-runner sample drop)
- **Progress UX**: `Stepper` (multi-step wizards), `Notifications`, `Tooltip`
- Hooks: prefer `@mantine/hooks` (`useDisclosure`, `useClickOutside`, `useHotkeys`, …) over hand-rolling.

## Why
Mantine is mature and battle-tested for accessibility. A review of the
hand-rolled SUI overlays found real gaps — `Dropdown` has no arrow-key
navigation, `Modal`/`Drawer` mishandle focus when there are no focusable
children, `Toast` uses `role="alert"` for every tone — exactly the things
Mantine gets right. Owning those is wasted effort and an a11y liability.

## Known migrations (hand-rolled today → should be Mantine)
These shipped as SUI primitives during the initial build and should move to
Mantine equivalents (fixes the a11y findings above):

| Today (SUI) | → Mantine |
|---|---|
| `Dropdown` (menus: tier switcher, app switcher, notifications) | `Menu` |
| `Modal` (composer, wizards, settings, create-key) | `Modal` |
| `Drawer` (pipeline detail) | `Drawer` |
| `Toast` | `notifications` |
| _new need:_ billing date range | `@mantine/dates` |
| _new need:_ file upload | `@mantine/dropzone` |

Keep `Tabs` SUI for the simple in-page switchers; only reach for more if a true
tabpanel/roving-focus contract is needed.

> Migrating overlays touches visible chrome and behaviour, so do it deliberately
> (with eyes on the result), not as a blind sweep.
