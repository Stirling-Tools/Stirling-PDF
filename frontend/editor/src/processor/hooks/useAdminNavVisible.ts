import { useProcessorAdmin } from "@processor/hooks/useProcessorAdmin";

/**
 * Whether nav entries marked {@code requiresAdmin} appear. Those entries are gated on
 * administering this instance, which is what self-hosted means by admin.
 *
 * <p>A seam because SaaS means something else by it: Supabase sessions carry no admin flag, so the
 * same check there would hide billing from every cloud user while processor-saas' own billing gate
 * still renders the page for them.
 */
export function useAdminNavVisible(): boolean {
  return useProcessorAdmin();
}
