// Define workbench values once as source of truth
export const BASE_WORKBENCH_TYPES = ['viewer', 'pageEditor', 'fileEditor'] as const;

export type BaseWorkbenchType = typeof BASE_WORKBENCH_TYPES[number];

// Workbench types including custom views
export type WorkbenchType = BaseWorkbenchType | `custom:${string}`;

export const getDefaultWorkbench = (): WorkbenchType => 'viewer';

// Type guard using the same source of truth
export const isValidWorkbench = (value: string): value is WorkbenchType => {
  if (BASE_WORKBENCH_TYPES.includes(value as BaseWorkbenchType)) {
    return true;
  }
  return value.startsWith('custom:');
};

export const isBaseWorkbench = (value: WorkbenchType): value is BaseWorkbenchType => {
  return BASE_WORKBENCH_TYPES.includes(value as BaseWorkbenchType);
};
