/**
 * The catalog of available policy *definitions* — the policy types, their
 * editable fields, the sources a policy can run over, and the document types
 * scope can be narrowed to. This is the single seam through which definitions
 * reach the UI: components never import the static definitions directly, they
 * read the catalog (via {@link usePolicyCatalog}).
 *
 * Backed by the static `policyDefinitions` today; swap {@link loadPolicyCatalog}
 * for a fetch to move definitions server-side without touching any component.
 */

import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  POLICY_SOURCES,
  POLICY_DOC_TYPES,
} from "@app/data/policyDefinitions";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicySource,
} from "@app/types/policies";

export interface PolicyCatalog {
  /** Available policy types, in display order. */
  categories: PolicyCategory[];
  /** Per-category narrative + editable field definitions, keyed by category id. */
  configs: Record<string, PolicyConfigDef>;
  /** Sources a policy can run over (wizard step 2). */
  sources: PolicySource[];
  /** Document types scope can be narrowed to (gated behind classification). */
  docTypes: string[];
}

/** Load the policy catalog. Swap this for a backend fetch to go live. */
export function loadPolicyCatalog(): PolicyCatalog {
  return {
    categories: POLICY_CATEGORIES,
    configs: POLICY_CONFIG,
    sources: POLICY_SOURCES,
    docTypes: POLICY_DOC_TYPES,
  };
}
