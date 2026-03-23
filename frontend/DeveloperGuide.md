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
