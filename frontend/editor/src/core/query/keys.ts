/**
 * Query keys for the editor: ["editor", <resource>, ...params].
 *
 * Keys are flavour-agnostic — which backend answers is decided by the api
 * layer, and on desktop by operationRouter at request time. A key therefore
 * does not pin a backend; see DesktopQueryCacheReset.
 */
export const qk = {
  footerInfo: () => ["editor", "footerInfo"] as const,
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  users: () => ["editor", "users"] as const,
} as const;
