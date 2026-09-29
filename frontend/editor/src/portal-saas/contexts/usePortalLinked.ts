/**
 * SaaS flavor: the signed-in account IS the SaaS account, so the portal is always
 * authorized — there is no account-link step. Procurement/checkout treats this as
 * "linked" and proceeds straight to the flow. No LinkContext dependency, so the
 * link machinery stays out of the SaaS bundle.
 */
export function usePortalLinked(): boolean {
  return true;
}
