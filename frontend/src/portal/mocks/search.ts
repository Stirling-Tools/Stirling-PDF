/** Mock quick-action catalogue for the ⌘K search palette. */

export interface QuickAction {
  group: "Jump to" | "Create" | "Theme";
  label: string;
  /** Keyboard hint shown to the right. */
  hint: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { group: "Jump to", label: "Home", hint: "G H" },
  { group: "Jump to", label: "Pipelines", hint: "G P" },
  { group: "Jump to", label: "Sources", hint: "G S" },
  { group: "Jump to", label: "Documents", hint: "G D" },
  { group: "Create", label: "New pipeline", hint: "N P" },
  { group: "Create", label: "New API key", hint: "N K" },
  { group: "Theme", label: "Toggle dark / light", hint: "T" },
];
