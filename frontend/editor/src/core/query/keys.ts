/**
 * The editor's TanStack Query keys, in one place. Convention:
 * ["editor", <resource>, ...params].
 *
 * Keys are flavour-agnostic on purpose. Which backend a request actually
 * reaches is decided by the api layer — on desktop, by operationRouter at
 * request time — so one key addresses whichever backend the build resolves.
 * The corollary is that a key can outlive the backend that filled it, which is
 * what {@link "@app/query/staleTime"} and the desktop cache reset guard against.
 */
export const qk = {
  /** GET /api/v1/ui-data/footer-info */
  footerInfo: () => ["editor", "footerInfo"] as const,
  /** GET /api/v1/config/group-enabled?group=… */
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  /** GET /api/v1/user/users */
  users: () => ["editor", "users"] as const,
} as const;
