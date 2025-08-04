# Tooltip Component

A flexible, accessible tooltip component that supports both regular positioning and special sidebar positioning logic with click-to-pin functionality. The tooltip is controlled by default, appearing on hover and pinning on click.

## Features

- 🎯 **Smart Positioning**: Automatically positions tooltips to stay within viewport bounds
- 📱 **Sidebar Support**: Special positioning logic for sidebar/navigation elements
- ♿ **Accessible**: Works with both mouse and keyboard interactions
- 🎨 **Customizable**: Support for arrows, structured content, and custom JSX
- 🌙 **Theme Support**: Built-in dark mode and theme variable support
- ⚡ **Performance**: Memoized calculations and efficient event handling
- 📜 **Scrollable**: Content area scrolls when content exceeds max height
- 📌 **Click-to-Pin**: Click to pin tooltips open, click outside or the close button to unpin
- 🔗 **Link Support**: Full support for clickable links in descriptions, bullets, and body content
- 🎮 **Controlled by Default**: Always uses controlled state management for consistent behavior

## Behavior

### Default Behavior (Controlled)
- **Hover**: Tooltips appear on hover with a small delay when leaving to prevent flickering
- **Click**: Click the trigger to pin the tooltip open
- **Click tooltip**: Pins the tooltip to keep it open
- **Click close button**: Unpins and closes the tooltip (red X button in top-right when pinned)
- **Click outside**: Unpins and closes the tooltip
- **Visual indicator**: Pinned tooltips have a blue border and close button

### Manual Control (Optional)
- Use `open` and `onOpenChange` props for complete external control
- Useful for complex state management or custom interaction patterns

## Basic Usage

```tsx
import { Tooltip } from '@/components/shared';

function MyComponent() {
  return (
    <Tooltip content="This is a helpful tooltip">
      <button>Hover me</button>
    </Tooltip>
  );
}
```

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | - | Custom JSX content to display in the tooltip |
| `tips` | `TooltipTip[]` | - | Structured content with title, description, bullets, and optional body |
| `children` | `ReactElement` | **required** | Element that triggers the tooltip |
| `sidebarTooltip` | `boolean` | `false` | Enables special sidebar positioning logic |
| `position` | `'right' \| 'left' \| 'top' \| 'bottom'` | `'right'` | Tooltip position (ignored if `sidebarTooltip` is true) |
| `offset` | `number` | `8` | Distance in pixels between trigger and tooltip |
| `maxWidth` | `number \| string` | `280` | Maximum width constraint for the tooltip |
| `open` | `boolean` | `undefined` | External open state (makes component fully controlled) |
| `onOpenChange` | `(open: boolean) => void` | `undefined` | Callback for external control |
| `arrow` | `boolean` | `false` | Shows a small triangular arrow pointing to the trigger element |
| `portalTarget` | `HTMLElement` | `undefined` | DOM node to portal the tooltip into |
| `header` | `{ title: string; logo?: ReactNode }` | - | Optional header with title and logo |

### TooltipTip Interface

```typescript
interface TooltipTip {
  title?: string;        // Optional pill label
  description?: string;  // Optional description text (supports HTML including <a> tags)
  bullets?: string[];    // Optional bullet points (supports HTML including <a> tags)
  body?: React.ReactNode; // Optional custom JSX for this tip
}
```

## Usage Examples

### Default Behavior (Recommended)

```tsx
// Simple tooltip with hover and click-to-pin
<Tooltip content="This tooltip appears on hover and pins on click">
  <button>Hover me</button>
</Tooltip>

// Structured content with tips
<Tooltip 
  tips={[
    {
      title: "OCR Mode",
      description: "Choose how to process text in your documents.",
      bullets: [
        "<strong>Auto</strong> skips pages that already contain text.",
        "<strong>Force</strong> re-processes every page.",
        "<strong>Strict</strong> stops if text is found.",
        "<a href='https://docs.example.com' target='_blank'>Learn more</a>"
      ]
    }
  ]}
  header={{
    title: "Basic Settings Overview",
    logo: <img src="/logo.svg" alt="Logo" />
  }}
>
  <button>Settings</button>
</Tooltip>
```

### Custom JSX Content

```tsx
<Tooltip 
  content={
    <div>
      <h3>Custom Content</h3>
      <p>Any JSX you want here</p>
      <button>Action</button>
      <a href="https://example.com">External link</a>
    </div>
  }
>
  <button>Custom tooltip</button>
</Tooltip>
```

### Mixed Content (Tips + Custom JSX)

```tsx
<Tooltip 
  tips={[
    { title: "Section", description: "Description" }
  ]}
  content={<div>Additional custom content below tips</div>}
>
  <button>Mixed content</button>
</Tooltip>
```

### Sidebar Tooltips

```tsx
// For items in a sidebar/navigation
<Tooltip 
  content="This tooltip appears to the right of the sidebar"
  sidebarTooltip={true}
>
  <div className="sidebar-item">
    📁 File Manager
  </div>
</Tooltip>
```

### With Arrows

```tsx
<Tooltip 
  content="Tooltip with arrow pointing to trigger"
  arrow={true}
  position="top"
>
  <button>Arrow tooltip</button>
</Tooltip>
```

### Manual Control (Advanced)

```tsx
function ManualControlTooltip() {
  const [open, setOpen] = useState(false);
  
  return (
    <Tooltip 
      content="Fully controlled tooltip"
      open={open}
      onOpenChange={setOpen}
    >
      <button onClick={() => setOpen(!open)}>
        Toggle tooltip
      </button>
    </Tooltip>
  );
}
```

## Click-to-Pin Interaction

### How to Use (Default Behavior)
1. **Hover** over the trigger element to show the tooltip
2. **Click** the trigger element to pin the tooltip open
3. **Click** the red X button in the top-right corner to close
4. **Click** anywhere outside the tooltip to close
5. **Click** the trigger again to toggle pin state

### Visual States
- **Unpinned**: Normal tooltip appearance
- **Pinned**: Blue border, subtle glow, and close button (X) in top-right corner

## Link Support

The tooltip fully supports clickable links in all content areas:

- **Descriptions**: Use `<a href="...">` in description strings
- **Bullets**: Use `<a href="...">` in bullet point strings  
- **Body**: Use JSX `<a>` elements in the body ReactNode
- **Content**: Use JSX `<a>` elements in custom content

Links automatically get proper styling with hover states and open in new tabs when using `target="_blank"`.

## Positioning Logic

### Regular Tooltips
- Uses the `position` prop to determine initial placement
- Automatically clamps to viewport boundaries
- Calculates optimal position based on trigger element's `getBoundingClientRect()`
- **Dynamic arrow positioning**: Arrow stays aligned with trigger even when tooltip is clamped

### Sidebar Tooltips
- When `sidebarTooltip={true}`, horizontal positioning is locked to the right of the sidebar
- Vertical positioning follows the trigger but clamps to viewport
- Automatically detects sidebar width or falls back to 240px
- **No arrows** - sidebar tooltips don't show arrows
