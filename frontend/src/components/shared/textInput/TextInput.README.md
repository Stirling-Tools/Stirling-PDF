# TextInput Component

A reusable text input component with optional icon, clear button, and theme-aware styling. This was created because Mantine's TextInput has limited styling

## Features

- **Theme-aware**: Automatically adapts to light/dark color schemes
- **Icon support**: Optional left icon with proper positioning
- **Clear button**: Optional clear button that appears when input has content
- **Accessible**: Proper ARIA labels and keyboard navigation
- **Customizable**: Flexible props for styling and behavior

## Usage

```tsx
import { TextInput } from '../shared/textInput';

// Basic usage
<TextInput
  value={searchValue}
  onChange={setSearchValue}
  placeholder="Search..."
/>

// With icon
<TextInput
  value={searchValue}
  onChange={setSearchValue}
  placeholder="Search tools..."
  icon={<span className="material-symbols-rounded">search</span>}
/>

// With custom clear handler
<TextInput
  value={searchValue}
  onChange={setSearchValue}
  onClear={() => {
    setSearchValue('');
    // Additional cleanup logic
  }}
/>

// Disabled state
<TextInput
  value={searchValue}
  onChange={setSearchValue}
  disabled={true}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | - | The input value (required) |
| `onChange` | `(value: string) => void` | - | Callback when input value changes (required) |
| `placeholder` | `string` | - | Placeholder text |
| `icon` | `React.ReactNode` | - | Optional left icon |
| `showClearButton` | `boolean` | `true` | Whether to show the clear button |
| `onClear` | `() => void` | - | Custom clear handler (defaults to setting value to empty string) |
| `className` | `string` | `''` | Additional CSS classes |
| `style` | `React.CSSProperties` | - | Additional inline styles |
| `autoComplete` | `string` | `'off'` | HTML autocomplete attribute |
| `disabled` | `boolean` | `false` | Whether the input is disabled |
| `readOnly` | `boolean` | `false` | Whether the input is read-only |
| `aria-label` | `string` | - | Accessibility label |

## Styling

The component uses CSS modules and automatically adapts to the current color scheme. The styling includes:

- Proper focus states with blue outline
- Hover effects on the clear button
- Theme-aware colors for text, background, and icons
- Responsive padding based on icon and clear button presence

## Accessibility

- Proper ARIA labels
- Keyboard navigation support
- Screen reader friendly clear button
- Focus management
