// Define workbench values once as source of truth
export const BASE_WORKBENCH_TYPES = [
  "viewer",
  // Multi-file page editor: every open PDF as its own track of pages.
  "pageEditor",
  "fileEditor",
  "myFiles",
  // The Multi-Tool's own single-document page editor, only reachable while
  // that tool is selected.
  "multiTool",
] as const;

export type BaseWorkbenchType = (typeof BASE_WORKBENCH_TYPES)[number];

// Workbench types including custom views
export type WorkbenchType = BaseWorkbenchType | `custom:${string}`;

export const getDefaultWorkbench = (): WorkbenchType => "viewer";

// Type guard using the same source of truth
export const isValidWorkbench = (value: string): value is WorkbenchType => {
  if (BASE_WORKBENCH_TYPES.includes(value as BaseWorkbenchType)) {
    return true;
  }
  return value.startsWith("custom:");
};

export const isBaseWorkbench = (
  value: WorkbenchType,
): value is BaseWorkbenchType => {
  return BASE_WORKBENCH_TYPES.includes(value as BaseWorkbenchType);
};

/**
 * Views that hold in-memory page edits, so leaving them with pending changes
 * must prompt: the multi-file page editor and the Multi-Tool's own editor.
 */
export const isPageEditorWorkbench = (value: WorkbenchType): boolean =>
  value === "pageEditor" || value === "multiTool";
