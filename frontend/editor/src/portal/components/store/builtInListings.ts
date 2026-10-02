import type { TFunction } from "i18next";
import { POLICY_CATEGORIES, POLICY_CONFIG } from "@portal/api/policies";
import { policyStepToWire } from "@app/policies/operations";
import { BUILT_IN_PREFIX } from "@portal/components/store/builtInIds";
import type {
  StoreListingDetail,
  StoreManifest,
  StoreRequiredOnInstall,
} from "@portal/api/store";

/**
 * Stirling's own pipeline templates, shown in the store as curated listings so the store always
 * has something in it. They come from the same catalogue the Pipelines page sets templates up
 * from, so they never drift from it, and they live in the frontend only: no store row, no stars
 * or install counts, and installing one opens the template's own setup rather than copying a
 * manifest. Ids come from builtInIds.
 */

/** Every template that can be set up today, as store listings. Coming-soon templates are left out. */
export function builtInListings(t: TFunction): StoreListingDetail[] {
  return POLICY_CATEGORIES.filter(
    (category) => !category.comingSoon && POLICY_CONFIG[category.id],
  ).map((category) => {
    const config = POLICY_CONFIG[category.id];
    const steps = config.defaultOperations.map((step) => {
      const { operation, parameters } = policyStepToWire(step);
      return { operation, parameters };
    });
    const requiredOnInstall: StoreRequiredOnInstall[] = [
      { kind: "source" },
      { kind: "destination" },
    ];
    return {
      storeId: `${BUILT_IN_PREFIX}${category.id}`,
      slug: category.id,
      name: t("portal.policies.defaultName", { category: t(category.label) }),
      description: t(category.desc),
      category: category.id,
      icon: category.id,
      tools: steps.map((step) => step.operation),
      starCount: 0,
      installCount: 0,
      updatedAt: "",
      curated: true,
      needsConnections: config.needsSource === true,
      starred: null,
      firstPublishedAt: "",
      latestChange: null,
      steps,
      requiredOnInstall,
      minimumStirlingVersion: null,
      status: "LISTED",
      removedBy: null,
      viewer: null,
    };
  });
}

export function builtInListing(
  storeId: string,
  t: TFunction,
): StoreListingDetail | null {
  return builtInListings(t).find((item) => item.storeId === storeId) ?? null;
}

/** Built-in listings matching the browse filters, applied the way the server applies them. */
export function filterBuiltIns(
  listings: StoreListingDetail[],
  q: string | undefined,
  category: string | undefined,
): StoreListingDetail[] {
  const query = (q ?? "").trim().toLowerCase();
  return listings.filter((item) => {
    if (category && item.category !== category) return false;
    if (!query) return true;
    return (
      item.storeId === query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.tools.some((tool) => tool.toLowerCase().includes(query))
    );
  });
}

/** What Download JSON saves for a built-in listing, in the shape a published listing's manifest has. */
export function builtInManifest(listing: StoreListingDetail): StoreManifest {
  return {
    manifestSchemaVersion: 1,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    icon: listing.icon,
    steps: listing.steps,
    requiredOnInstall: listing.requiredOnInstall,
  };
}
