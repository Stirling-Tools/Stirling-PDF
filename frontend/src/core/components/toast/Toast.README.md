# Toast Component

A global notification system with expandable content, progress tracking, and smart error coalescing. Provides an imperative API for showing success, error, warning, and neutral notifications with customizable content and behavior.

---

## Highlights

* 🎯 **Global System**: Imperative API accessible from anywhere in the app via `alert()` function.
* 🎨 **Four Alert Types**: Success (green), Error (red), Warning (yellow), Neutral (theme-aware).
* 📱 **Expandable Content**: Collapsible toasts with chevron controls and smooth animations.
* ⚡ **Smart Coalescing**: Duplicate error toasts merge with count badges (e.g., "Server error 4").
* 📊 **Progress Tracking**: Built-in progress bars with completion animations.
* 🎛️ **Customizable**: Rich JSX content, buttons with callbacks, custom icons.
* 🌙 **Themeable**: Uses CSS variables; supports light/dark mode out of the box.
* ♿ **Accessible**: Proper ARIA roles, keyboard navigation, and screen reader support.
* 🔄 **Auto-dismiss**: Configurable duration with persistent popup option.
* 📍 **Positioning**: Four corner positions with proper stacking.

---

## Behavior

### Default
* **Auto-dismiss**: Toasts disappear after 6 seconds unless `isPersistentPopup: true`.
* **Expandable**: Click chevron to expand/collapse body content (default: collapsed).
* **Coalescing**: Identical error toasts merge with count badges.
* **Progress**: Progress bars always visible when present, even when collapsed.

### Error Handling
* **Network Errors**: Automatically caught by Axios and fetch interceptors.
* **Friendly Fallbacks**: Shows "There was an error processing your request" for unhelpful backend responses.
* **Smart Titles**: "Server error" for 5xx, "Request error" for 4xx, "Network error" for others.

---

## Installation

The toast system is already integrated at the app root. No additional setup required.

```tsx
import { alert, updateToast, dismissToast } from '@/components/toast';
```

---

## Basic Usage

### Simple Notifications

```tsx
// Success notification
alert({
  alertType: 'success',
  title: 'File processed successfully',
  body: 'Your document has been converted to PDF.'
});

// Error notification
alert({
  alertType: 'error',
  title: 'Processing failed',
  body: 'Unable to process the selected files.'
});

// Warning notification
alert({
  alertType: 'warning',
  title: 'Low disk space',
  body: 'Consider freeing up some storage space.'
});

// Neutral notification
alert({
  alertType: 'neutral',
  title: 'Information',
  body: 'This is a neutral notification.'
});
```

### With Custom Content

```tsx
// Rich JSX content with buttons
alert({
  alertType: 'success',
  title: 'Download complete',
  body: (
    <div>
      <p>File saved to Downloads folder</p>
      <button onClick={() => openFolder()}>Open folder</button>
    </div>
  ),
  buttonText: 'View file',
  buttonCallback: () => openFile(),
  isPersistentPopup: true
});
```

### Progress Tracking

```tsx
// Show progress
const toastId = alert({
  alertType: 'neutral',
  title: 'Processing files...',
  body: 'Converting your documents',
  progressBarPercentage: 0
});

// Update progress
updateToast(toastId, { progressBarPercentage: 50 });

// Complete with success
updateToast(toastId, { 
  alertType: 'success',
  title: 'Processing complete',
  body: 'All files converted successfully',
  progressBarPercentage: 100
});
```

### Custom Positioning

```tsx
alert({
  alertType: 'error',
  title: 'Connection lost',
  body: 'Please check your internet connection.',
  location: 'top-right'
});
```

---

## API

### `alert(options: ToastOptions)`

The primary function for showing toasts.

```ts
interface ToastOptions {
  alertType?: 'success' | 'error' | 'warning' | 'neutral';
  title: string;
  body?: React.ReactNode;
  buttonText?: string;
  buttonCallback?: () => void;
  isPersistentPopup?: boolean;
  location?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  icon?: React.ReactNode;
  progressBarPercentage?: number; // 0-1 as fraction or 0-100 as percent
  durationMs?: number;
  id?: string;
  expandable?: boolean;
}
```

### `updateToast(id: string, options: Partial<ToastOptions>)`

Update an existing toast.

```tsx
const toastId = alert({ title: 'Processing...', progressBarPercentage: 0 });
updateToast(toastId, { progressBarPercentage: 75 });
```

### `dismissToast(id: string)`

Dismiss a specific toast.

```tsx
dismissToast(toastId);
```

### `dismissAllToasts()`

Dismiss all visible toasts.

```tsx
dismissAllToasts();
```

---

## Alert Types

| Type | Color | Icon | Use Case |
|------|-------|------|----------|
| `success` | Green | ✓ | Successful operations, completions |
| `error` | Red | ✗ | Failures, errors, exceptions |
| `warning` | Yellow | ⚠ | Warnings, cautions, low resources |
| `neutral` | Theme | ℹ | Information, general messages |

---

## Positioning

| Location | Description |
|----------|-------------|
| `top-left` | Top-left corner |
| `top-right` | Top-right corner |
| `bottom-left` | Bottom-left corner |
| `bottom-right` | Bottom-right corner (default) |

---

## Accessibility

* Toasts use `role="status"` for screen readers.
* Chevron and close buttons have proper `aria-label` attributes.
* Keyboard navigation supported (Escape to dismiss).
* Focus management for interactive content.

---

## Examples

### File Processing Workflow

```tsx
// Start processing
const toastId = alert({
  alertType: 'neutral',
  title: 'Processing files...',
  body: 'Converting 5 documents',
  progressBarPercentage: 0,
  isPersistentPopup: true
});

// Update progress
updateToast(toastId, { progressBarPercentage: 30 });
updateToast(toastId, { progressBarPercentage: 60 });

// Complete successfully
updateToast(toastId, {
  alertType: 'success',
  title: 'Processing complete',
  body: 'All 5 documents converted successfully',
  progressBarPercentage: 100,
  isPersistentPopup: false
});
```

### Error with Action

```tsx
alert({
  alertType: 'error',
  title: 'Upload failed',
  body: 'File size exceeds the 10MB limit.',
  buttonText: 'Try again',
  buttonCallback: () => retryUpload(),
  isPersistentPopup: true
});
```

### Non-expandable Toast

```tsx
alert({
  alertType: 'success',
  title: 'Settings saved',
  body: 'Your preferences have been updated.',
  expandable: false,
  durationMs: 3000
});
```

### Custom Icon

```tsx
alert({
  alertType: 'neutral',
  title: 'New feature available',
  body: 'Check out the latest updates.',
  icon: <LocalIcon icon="star" />
});
```

---

## Integration

### Network Error Handling

The toast system automatically catches network errors from Axios and fetch requests:

```tsx
// These automatically show error toasts
axios.post('/api/convert', formData);
fetch('/api/process', { method: 'POST', body: data });
```

### Manual Error Handling

```tsx
try {
  await processFiles();
  alert({ alertType: 'success', title: 'Files processed' });
} catch (error) {
  alert({ 
    alertType: 'error', 
    title: 'Processing failed',
    body: error.message 
  });
}
```

