import { useLink } from "@portal/contexts/LinkContext";

/**
 * Whether the portal is authorized against a SaaS billing account — the gate the
 * procurement/checkout flow uses. Self-hosted flavor: true once the instance has
 * linked its SaaS account. The SaaS build shadows this file to return true
 * unconditionally: the signed-in account IS the SaaS account, so there is no link
 * step and nothing to gate on.
 */
export function usePortalLinked(): boolean {
  return useLink().isLinked;
}
