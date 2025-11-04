# Tooltip Component

A flexible, accessible tooltip component supporting regular positioning and special sidebar positioning, with optional click‑to‑pin behavior. By default, it opens on hover/focus and can be pinned on click when `pinOnClick` is enabled.

---

## Highlights

* 🎯 **Smart Positioning**: Keeps tooltips within the viewport and aligns the arrow dynamically.
* 📱 **Sidebar Aware**: Purpose‑built logic for sidebar/navigation contexts.
* ♿ **Accessible**: Keyboard and screen‑reader friendly (`role="tooltip"`, `aria-describedby`, Escape to close, focus/blur support).
* 🎨 **Customizable**: Arrows, headers, rich JSX content, and structured tips.
* 🌙 **Themeable**: Uses CSS variables; supports dark mode out of the box.
* ⚡ **Efficient**: Memoized calculations and stable callbacks to minimize re‑renders.
* 📜 **Scrollable Content**: When content exceeds max height.
* 📌 **Click‑to‑Pin**: (Optional) Pin open; close via outside click or close button.
* 🔗 **Link‑Safe**: Fully clickable links in descriptions, bullets, and custom content.
* 🖱️ **Pointer‑Friendly**: Uses pointer events (works with mouse/pen/touch hover where applicable).

---

## Behavior

### Default

* **Hover/Focus**: Opens on pointer **enter** or when the trigger receives **focus** (respects optional `delay`).
* **Leave/Blur**: Closes on pointer **leave** (from trigger *and* tooltip) or when the trigger/tooltip **blurs** to the page—unless pinned.
* **Inside Tooltip**: Moving from trigger → tooltip keeps it open; moving out of both closes it (unless pinned).
* **Escape**: Press **Esc** to close.

### Click‑to‑Pin (optional)

* Enable with `pinOnClick`.
* **Click trigger** (or tooltip) to pin open.
* **Click outside** **both** trigger and tooltip to close when pinned.
* Use the close button (X) to unpin and close.

> **Note**: Outside‑click closing when **not** pinned is configurable via `closeOnOutside` (default `true`).

---

## Installation

```tsx
import { Tooltip } from '@/components/shared';
```

---

## Basic Usage

```tsx
<Tooltip content="This is a helpful tooltip">
  <button>Hover me</button>
</Tooltip>
```

With structured tips and a header:

```tsx
<Tooltip
  tips={[{
    title: 'OCR Mode',
    description: 'Choose how to process text in your documents.',
    bullets: [
      '<strong>Auto</strong> skips pages that already contain text.',
      '<strong>Force</strong> re-processes every page.',
      '<strong>Strict</strong> stops if text is found.',
      "<a href='https://docs.example.com' target='_blank' rel='noreferrer'>Learn more</a>",
    ],
  }]}
  header={{ title: 'Basic Settings Overview', logo: <img src="/logo.svg" alt="Logo" /> }}
>
  <button>Settings</button>
</Tooltip>
```

---

## API

### `<Tooltip />` Props

| Prop             | Type                                     | Default      | Description                                                                                                                  |
| ---------------- | ---------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `children`       | `ReactElement`                           | **required** | The trigger element. Receives ARIA and event handlers.                                                                       |
| `content`        | `ReactNode`                              | `undefined`  | Custom JSX content rendered below any `tips`.                                                                                |
| `tips`           | `TooltipTip[]`                           | `undefined`  | Structured content (title, description, bullets, optional body).                                                             |
| `sidebarTooltip` | `boolean`                                | `false`      | Enables special sidebar positioning logic (no arrow in sidebar mode).                                                        |
| `position`       | `'right' \| 'left' \| 'top' \| 'bottom'` | `'right'`    | Preferred placement (ignored if `sidebarTooltip` is `true`).                                                                 |
| `offset`         | `number`                                 | `8`          | Gap (px) between trigger and tooltip.                                                                                        |
| `maxWidth`       | `number \| string`                       | `undefined`  | Max width. If omitted and `sidebarTooltip` is true, defaults visually to \~`25rem`.                                          |
| `minWidth`       | `number \| string`                       | `undefined`  | Min width.                                                                                                                   |
| `open`           | `boolean`                                | `undefined`  | Controlled open state. If provided, the component is controlled.                                                             |
| `onOpenChange`   | `(open: boolean) => void`                | `undefined`  | Callback when open state would change.                                                                                       |
| `arrow`          | `boolean`                                | `false`      | Shows a directional arrow (suppressed in sidebar mode).                                                                      |
| `portalTarget`   | `HTMLElement`                            | `undefined`  | DOM node to portal the tooltip into.                                                                                         |
| `header`         | `{ title: string; logo?: ReactNode }`    | `undefined`  | Optional header with title and logo.                                                                                         |
| `delay`          | `number`                                 | `0`          | Hover/focus open delay in ms.                                                                                                |
| `containerStyle` | `React.CSSProperties`                    | `{}`         | Inline style overrides for the tooltip container.                                                                            |
| `pinOnClick`     | `boolean`                                | `false`      | Clicking the trigger pins the tooltip open.                                                                                  |
| `closeOnOutside` | `boolean`                                | `true`       | When not pinned, clicking outside closes the tooltip. Always closes when pinned and clicking outside both trigger & tooltip. |

### `TooltipTip`

```ts
export interface TooltipTip {
  title?: string;         // Optional pill label
  description?: string;   // HTML allowed (e.g., <a>)
  bullets?: string[];     // HTML allowed in each string
  body?: React.ReactNode; // Optional custom JSX
}
```

---

## Accessibility

* The tooltip container uses `role="tooltip"` and gets a stable `id`.
* The trigger receives `aria-describedby` when the tooltip is open.
* Opens on **focus** and closes on **blur** (unless pinned), supporting keyboard navigation.
* **Escape** closes the tooltip.
* Pointer events are mirrored with keyboard/focus for parity.

> Ensure custom triggers remain focusable (e.g., `button`, `a`, or add `tabIndex=0`).

---

## Interaction Details

* **Hover Timing**: Opening can be delayed via `delay`. Closing is immediate on pointer leave from both trigger and tooltip (unless pinned). Timers are cleared on state changes and unmounts.
* **Outside Clicks**: When pinned, clicking outside **both** the trigger and tooltip closes it. When not pinned, outside clicks close it if `closeOnOutside` is `true`.
* **Event Preservation**: Original child event handlers (`onClick`, `onPointerEnter`, etc.) are called after the tooltip augments them.
* **Refs**: The trigger’s existing `ref` (function or object) is preserved.

---

## Examples

### With Arrow

```tsx
<Tooltip content="Arrow tooltip" arrow position="top">
  <button>Arrow tooltip</button>
</Tooltip>
```

### Optional Hover Delay

```tsx
<Tooltip content="Appears after 1s" delay={1000}>
  <button>Delayed</button>
</Tooltip>
```

### Manual Control (Advanced)

```tsx
function ManualControlTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip content="Fully controlled tooltip" open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(!open)}>Toggle tooltip</button>
    </Tooltip>
  );
}
```

### Sidebar Tooltip

```tsx
<Tooltip content="Appears to the right of the sidebar" sidebarTooltip>
  <div className="sidebar-item">📁 File Manager</div>
</Tooltip>
```

### Mixed Content

```tsx
<Tooltip
  tips={[{ title: 'Section', description: 'Description' }]}
  content={<div>Additional custom content below tips</div>}
>
  <button>Mixed content</button>
</Tooltip>
```

---

## Positioning Notes

* Initial placement is derived from `position` (or sidebar rules when `sidebarTooltip` is true).
* Tooltip is clamped within the viewport; the arrow is offset to remain visually aligned with the trigger.
* Sidebar mode positions to the sidebar’s edge and clamps vertically. Arrows are disabled in sidebar mode.

---

## Caveats & Tips

* Ensure your container doesn’t block pointer events between trigger and tooltip.
* When using `portalTarget`, confirm it’s attached to `document.body` before rendering.
* For very dynamic layouts, call positioning after layout changes (the hook already listens to open/refs/viewport).

---

## Changelog (since previous README)

* Added keyboard & ARIA details (focus/blur, Escape, `aria-describedby`).
* Clarified outside‑click behavior for pinned vs unpinned.
* Documented `closeOnOutside` and `minWidth`, `containerStyle`, `pinOnClick`.
* Removed references to non‑existent props (e.g., `delayAppearance`).
* Corrected defaults (no hard default `maxWidth`; sidebar visually \~`25rem`).
