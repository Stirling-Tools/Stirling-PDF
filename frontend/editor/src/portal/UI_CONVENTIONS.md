# Portal UI conventions — SUI vs Mantine

The portal has one component source from the caller's point of view: **SUI
(`@app/ui`)**. Under the hood there are two kinds of SUI component. The rule:

> **Simple, presentational, brand-defining UI → hand-rolled SUI components.
> Complex, stateful, or accessibility-hard widgets → Mantine, wrapped behind a
> locked SUI interface.** Either way, callers import from `@app/ui`. Mantine is
> an implementation detail of the design system — feature code never imports
> `@mantine/core` directly.

Theme wiring lives in one place: `SuiProvider` (`@portal/theme/SuiProvider`)
applies the SUI-token Mantine theme, remaps Mantine's neutral palette
(dropdown/popover surfaces, borders, text) onto SUI tokens via
`suiCssVariablesResolver`, and takes the resolved light/dark scheme so Mantine
chrome and the SUI CSS variables switch together. The app and Storybook both
render through it.

## Hand-rolled SUI — our own style

Layout and presentational primitives we want full brand control over and that
are cheap to own:

`Button` · `Card` · `StatusBadge` / `MethodBadge` · `Chip` · `MetricCard` ·
`MetricStrip` · `StatTile` · `ProgressBar` · `Avatar` · `Banner` · `Skeleton` ·
`Spinner` · `EmptyState` · `NavItem` · `PanelHeader` · `SectionDivider` ·
`Stack` / `Inline` · `Table` (static/presentational) · `CodeBlock` ·
`FormField` (label/help/error layout) · simple `Tabs`.

## Mantine-backed SUI — don't reinvent, but do own the interface

Anything that needs portals, focus traps, ARIA keyboard patterns, or is just a
solved hard problem gets a Mantine implementation behind a SUI wrapper.
Shipped today: `Select` · `MultiSelect` · `NumberInput` · `ColorInput` ·
`Slider`.

Every wrapper follows the same contract (use the existing ones as the
template):

- **Explicit prop allowlist.** Only behavioural props are exposed; appearance
  props (`color`, `variant`, `radius`, `classNames`, `styles`) are locked
  internally to SUI tokens.
- **No labels or error text.** Callers use `<FormField>` for both. Wrappers
  take an `invalid` flag that applies error styling only; Mantine never
  renders its own message element.
- **Accessibility props forwarded.** `id`, `aria-label`, `aria-invalid`, and
  `aria-describedby` pass through so `FormField`'s injected wiring reaches the
  underlying input.
- **Typed escape hatches** (`comboboxProps`, `popoverProps`, `rightSection`)
  for the z-index-in-modal case, documented on the component.

When a feature needs a Mantine widget that has no wrapper yet (`Modal`,
`Drawer`, `Menu`, `Stepper`, `Tooltip`, `@mantine/dates`,
`@mantine/dropzone`, …), add the wrapper to `@app/ui` following this contract
rather than importing Mantine in feature code. Hooks are the exception:
prefer `@mantine/hooks` (`useDisclosure`, `useClickOutside`, `useHotkeys`, …)
over hand-rolling, imported directly.

## Why

Mantine is mature and battle-tested for accessibility. A review of the
hand-rolled SUI overlays found real gaps — `Dropdown` has no arrow-key
navigation, `Modal`/`Drawer` mishandle focus when there are no focusable
children, `Toast` uses `role="alert"` for every tone — exactly the things
Mantine gets right. Owning those is wasted effort and an a11y liability.

The wrapper (rather than direct Mantine use) is what keeps the door open to
swapping the implementation later: callers depend on the SUI contract, not on
Mantine's API surface.

## Known migrations (hand-rolled today → Mantine-backed SUI)

These shipped as hand-rolled primitives during the initial build and should
move to Mantine-backed wrappers (fixes the a11y findings above). `Select` and
`Slider` have already made this move.

| Today (hand-rolled)                                            | → Mantine-backed SUI wrapper |
| -------------------------------------------------------------- | ---------------------------- |
| `Dropdown` (menus: tier switcher, app switcher, notifications)  | wraps `Menu`                 |
| `Modal` (composer, wizards, settings, create-key)               | wraps `Modal`                |
| `Drawer` (pipeline detail)                                      | wraps `Drawer`               |
| `Toast`                                                         | wraps `notifications`        |
| _new need:_ billing date range                                  | wraps `@mantine/dates`       |
| _new need:_ file upload                                         | wraps `@mantine/dropzone`    |

Keep `Tabs` hand-rolled for the simple in-page switchers; only reach for more
if a true tabpanel/roving-focus contract is needed.

> Migrating overlays touches visible chrome and behaviour, so do it deliberately
> (with eyes on the result), not as a blind sweep.
