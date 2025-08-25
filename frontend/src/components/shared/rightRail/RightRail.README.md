# RightRail Component

A dynamic vertical toolbar on the right side of the application that supports both static buttons (Undo/Redo, Save, Print, Share) and dynamic buttons registered by tools.

## Structure

- **Top Section**: Dynamic buttons from tools (empty when none)
- **Middle Section**: Grid, Cut, Undo, Redo
- **Bottom Section**: Save, Print, Share

## Usage

### For Tools (Recommended)

```tsx
import { useRightRailButtons } from '../hooks/useRightRailButtons';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

function MyTool() {
  const handleAction = useCallback(() => {
    // Your action here
  }, []);

  useRightRailButtons([
    {
      id: 'my-action',
      icon: <PlayArrowIcon />,
      tooltip: 'Execute Action',
      onClick: handleAction,
    },
  ]);

  return <div>My Tool</div>;
}
```

### Multiple Buttons

```tsx
useRightRailButtons([
  {
    id: 'primary',
    icon: <StarIcon />,
    tooltip: 'Primary Action',
    order: 1,
    onClick: handlePrimary,
  },
  {
    id: 'secondary',
    icon: <SettingsIcon />,
    tooltip: 'Secondary Action',
    order: 2,
    onClick: handleSecondary,
  },
]);
```

### Conditional Buttons

```tsx
useRightRailButtons([
  // Always show
  {
    id: 'process',
    icon: <PlayArrowIcon />,
    tooltip: 'Process',
    disabled: isProcessing,
    onClick: handleProcess,
  },
  // Only show when condition met
  ...(hasResults ? [{
    id: 'export',
    icon: <DownloadIcon />,
    tooltip: 'Export',
    onClick: handleExport,
  }] : []),
]);
```

## API

### Button Config

```typescript
interface RightRailButtonWithAction {
  id: string;                    // Unique identifier
  icon: React.ReactNode;         // Icon component
  tooltip: string;               // Hover tooltip
  section?: 'top' | 'middle' | 'bottom'; // Section (default: 'top')
  order?: number;                // Sort order (default: 0)
  disabled?: boolean;            // Disabled state (default: false)
  visible?: boolean;             // Visibility (default: true)
  onClick: () => void;           // Click handler
}
```

## Built-in Features

- **Undo/Redo**: Automatically integrates with Page Editor
- **Theme Support**: Light/dark mode with CSS variables
- **Auto Cleanup**: Buttons unregister when tool unmounts

## Best Practices

- Use descriptive IDs: `'compress-optimize'`, `'ocr-process'`
- Choose appropriate Material-UI icons
- Keep tooltips concise: `'Compress PDF'`, `'Process with OCR'`
- Use `useCallback` for click handlers to prevent re-registration
