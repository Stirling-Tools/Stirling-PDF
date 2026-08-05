/** Editor query keys: ["editor", <resource>, ...params]. */
export const qk = {
  footerInfo: () => ["editor", "footerInfo"] as const,
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  users: () => ["editor", "users"] as const,
} as const;
