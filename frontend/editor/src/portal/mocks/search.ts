/**
 * Mock quick-action catalogue for the ⌘K search palette. The QuickAction type
 * lives in api/search.ts (the backend contract); this module only builds fake
 * data for Storybook and tests.
 */

import type { QuickAction } from "@portal/api/search";

export const QUICK_ACTIONS: QuickAction[] = [
  { group: "Jump to", label: "Home", hint: "G H" },
  { group: "Jump to", label: "Pipelines", hint: "G P" },
  { group: "Jump to", label: "Sources", hint: "G S" },
  { group: "Jump to", label: "Documents", hint: "G D" },
  { group: "Create", label: "New pipeline", hint: "N P" },
  { group: "Create", label: "New API key", hint: "N K" },
  { group: "Theme", label: "Toggle dark / light", hint: "T" },
];
