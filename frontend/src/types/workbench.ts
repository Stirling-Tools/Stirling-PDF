// Define workbench values once as source of truth
const WORKBENCH_TYPES = ['viewer', 'pageEditor', 'fileEditor'] as const;

// Workbench types - how the user interacts with content
export type WorkbenchType = typeof WORKBENCH_TYPES[number];

export const getDefaultWorkbench = (): WorkbenchType => 'fileEditor';

// Type guard using the same source of truth
export const isValidWorkbench = (value: string): value is WorkbenchType => {
  return WORKBENCH_TYPES.includes(value as WorkbenchType);
};