/** Editor query keys: ["editor", <resource>, ...params]. */
export const qk = {
  appConfig: () => ["editor", "appConfig"] as const,
  footerInfo: () => ["editor", "footerInfo"] as const,
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  users: () => ["editor", "users"] as const,
} as const;
