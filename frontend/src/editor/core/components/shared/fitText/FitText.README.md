# FitText Component

Adaptive text component that automatically scales font size down so the content fits within its container, with optional multi-line clamping. Built with a small hook wrapper around ResizeObserver and MutationObserver for reliable, responsive fitting.

## Features

- 📏 Auto-fit text to available width (and optional line count)
- 🧵 Single-line and multi-line support with clamping and ellipsis
- 🔁 React hook + component interface
- ⚡ Efficient: observers and rAF, minimal layout thrash
- 🎛️ Configurable min scale, max font size, and step size

## Behavior

- On mount and whenever size/text changes, the font is reduced (never increased) until the text fits the given constraints.
- If `lines` is provided, height is constrained to an estimated maximum based on computed line-height.

## Basic Usage

```tsx
import FitText from '@/components/shared/FitText';

export function CardTitle({ title }: { title: string }) {
  return (
    <FitText text={title} />
  );
}
```

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | — | The string to render and fit |
| `fontSize` | `number` | computed | Maximum starting font size in rem (e.g., 1.2, 0.9) |
| `minimumFontScale` | `number` | `0.8` | Smallest scale relative to the max (0..1) |
| `lines` | `number` | `1` | Maximum number of lines to display and fit |
| `className` | `string` | — | Optional class on the rendered element |
| `style` | `CSSProperties` | — | Inline styles (merged with internal clamp styles) |
| `as` | `'span' | 'div'` | `'span'` | HTML tag to render |

Notes:
- For multi-line, the component applies WebKit line clamping (with reasonable fallbacks) and fits within that height.
- The component only scales down; if the content already fits, it keeps the starting size.

## Examples

### Single-line title (default)

```tsx
<FitText text="Very long single-line title that should shrink" />
```

### Multi-line label (up to 3 lines)

```tsx
<FitText
  text="This label can wrap up to three lines and will shrink so it fits nicely"
  lines={3}
  minimumFontScale={0.6}
  className="my-multiline-label"
/>
```

### Explicit starting size

```tsx
<FitText text="Starts at 1.2rem, scales down if needed" fontSize={1.2} />
```

### Render as a div

```tsx
<FitText as="div" text="Block-level content" lines={2} />
```

## Hook Usage (Advanced)

If you need to control your own element, you can use the underlying hook directly.

```tsx
import React, { useRef } from 'react';
import { useAdjustFontSizeToFit } from '@/components/shared/fitText/textFit';

export function CustomFit() {
  const ref = useRef<HTMLSpanElement | null>(null);

  useAdjustFontSizeToFit(ref as any, {
    maxFontSizePx: 20,
    minFontScale: 0.6,
    maxLines: 2,
    singleLine: false,
  });

  return (
    <span ref={ref} style={{ display: 'inline-block', maxWidth: 240 }}>
      Arbitrary text that will scale to fit two lines.
    </span>
  );
}
```

## Tips

- For predictable measurements, ensure the container has a fixed width (or stable layout) when fitting occurs.
- Avoid animating width while fitting; update after animation completes for best results.
- When you need more control of typography, pass `fontSize` to define the starting ceiling.
- **Important**: The `fontSize` prop expects `rem` values (e.g., 1.2, 0.9) to ensure text scales with global font size changes.


