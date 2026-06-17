import { useMemo } from "react";
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
 */
export function usePolicyCatalog(): PolicyCatalog {
  return useMemo(() => loadPolicyCatalog(), []);
}
