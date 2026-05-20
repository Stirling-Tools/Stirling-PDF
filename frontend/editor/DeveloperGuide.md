# Frontend Developer Guide

This document is a guide to the main frontend architectural rules in Stirling-PDF.

## Mode-Specific Code

There are several different builds of the frontend, each with their own mode-specific code.
The frontend uses [TypeScript Path Aliases](https://www.typescriptlang.org/tsconfig/#paths) to ensure that only relevant code for the configured app version will be present in the build.
Refer to the various `tsconfig.*.json` files to see the specific path alias order.

The vast majority of the code is in the `src/core` folder, which is the open-source app.
Other builds, such as the desktop app, use `src/core` as the base layer, and then override various files to change behaviour.
If an import is `from '@app/a/b'`, this will refer to `src/core/a/b.ts` in the core build of the app, but may refer to `src/desktop/a/b.ts` in the desktop app if that file exists.

It is important to try to minimise the amount of overridden code in the app.
Often, just one function needs to behave differently in a specific mode.
For example:

```ts
// core/file1.ts
function f1() { /* ... */ }
function f2() { /* ... */ } // Needs to be overridden in desktop
function f3() { /* ... */ }
```

In cases like this, instead of duplicating the entire file, create a new extension module for the core app and override _that_ in the desktop app.

```ts
// core/file1.ts
import { f2 } from '@app/file1Extensions';

function f1() { /* ... */ }
function f3() { /* ... */ }
```

```ts
// core/file1Extensions.ts
export function f2() { /* ... */ } // Original core implementation
```

```ts
// desktop/file1Extensions.ts
export function f2() { /* ... */ } // Custom desktop implementation
```

Building with this pattern minimises the duplicated code in the system and greatly reduces the chances that changing the core app will break the desktop app.

### Naming extension modules

Extension modules and the functions/hooks they export should be named after **what they do**, not **which build overrides them**.
Core code must never reference build targets (desktop, saas, etc.) by name — it should simply call a generic extension point and remain unaware of which layer is providing the implementation.

```ts
// ✅ CORRECT - named after the behaviour, not the build
// core/useFrontendVersionInfo.ts
export function useFrontendVersionInfo() { /* stub */ }

// desktop/useFrontendVersionInfo.ts
export function useFrontendVersionInfo() { /* real Tauri implementation */ }
```

```ts
// ❌ WRONG - core code reveals knowledge of the desktop layer
// core/useDesktopVersionInfo.ts
export function useDesktopVersionInfo() { /* stub */ }
```

Similarly, core code should never contain conditionals that check which build is active (e.g. `if (isDesktop)`).
If behaviour needs to vary, that variation belongs in an extension module - the core simply calls it.

The same principle applies in reverse: code inside `desktop/` is guaranteed to be running in the Tauri environment, so `isTauri()` checks are never needed there either.
If you find yourself writing `if (isDesktop())` or `if (isTauri())` anywhere, that is a sign the extension point has not been modelled correctly - the build system is already doing that separation for you.

### List extensions

When a build needs to _add_ behaviour rather than _replace_ it, the extension module can return a list of items and let core manage the rendering.
Core defines the function to return an empty list; the extension build overrides it to return a populated one.

```ts
// core/toolbarExtensions.ts
export interface ToolbarButton {
  label: string;
  onClick: () => void;
}

export function getToolbarButtons(): ToolbarButton[] {
  return [];
}
```

```ts
// desktop/toolbarExtensions.ts
import { type ToolbarButton } from '@core/toolbarExtensions';
export { type ToolbarButton };

export function getToolbarButtons(): ToolbarButton[] {
  return [
    { label: 'Open folder', onClick: () => { /* ... */ } },
  ];
}
```

```tsx
// core/Toolbar.tsx
import { getToolbarButtons } from '@app/toolbarExtensions';

export function Toolbar() {
  return (
    <div>
      <button onClick={() => { /* ... */ }}>Download</button>
      <button onClick={() => { /* ... */ }}>Print</button>
      {getToolbarButtons().map((button) => (
        <button key={button.label} onClick={button.onClick}>
          {button.label}
        </button>
      ))}
    </div>
  );
}
```

This pattern works well for things like menu items or toolbar actions - anything where a build contributes additional entries to a well-defined set.

### Import aliases

In general, all imports for app code should come via `@app` because it allows for other builds of the app to override behaviour if necessary.
The only time that it is beneficial to import via a specific folder (e.g. `@core`) is when you want to reduce duplication **in the file you are overriding**. For example:

```ts
// core/file2.ts

export interface MyProps {
  // Lots of properties that we don't want to duplicate
}

export function f1(props: MyProps) { /* ... */ } // Original core implementation
```

```ts
// desktop/file2.ts

import { type MyProps } from '@core/file2';
export { type MyProps }; // Re-export so anything importing file2 can still access MyProps

export function f1(props: MyProps) { /* ... */ } // Custom desktop implementation
```
