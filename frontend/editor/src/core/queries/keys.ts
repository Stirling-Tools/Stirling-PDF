export const editorQk = {
  endpointsAvailability: () => ["editor", "endpoints-availability"] as const,
  groupEnabled: (group: string) => ["editor", "group-enabled", group] as const,
  appConfig: () => ["editor", "app-config"] as const,
  saasAppConfig: () => ["editor", "saas-app-config"] as const,
} as const;
