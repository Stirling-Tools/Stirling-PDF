import { useMemo } from "react";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import {
  loadPolicyCatalog,
  type PolicyCatalog,
} from "@app/services/policyCatalog";

/**
 * Policy definitions (categories / fields / sources / doc types) delivered
 * through the catalog seam, so components never import the static definitions
 * directly. Memoised; when the catalog becomes a backend fetch, this hook is
 * where loading/error state would be introduced — its consumers already treat
 * it as the single source of definitions.
 *
 * Categories flagged {@link PolicyCategory.requiresAiEngine} are hidden while the
 * AI engine is off, so a policy only appears where it can actually run.
 */
export function usePolicyCatalog(): PolicyCatalog {
  const aiEngineEnabled = useAiEngineEnabled();
  return useMemo(() => {
    const catalog = loadPolicyCatalog();
    if (aiEngineEnabled) return catalog;
    return {
      ...catalog,
      categories: catalog.categories.filter(
        (category) => !category.requiresAiEngine,
      ),
    };
  }, [aiEngineEnabled]);
}
