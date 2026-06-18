/**
 * Shared fixtures for the policy component stories — a configured, decorated
 * policy built straight from the catalogue + seed data, so stories render the
 * same shapes the MSW handlers serve without standing up the whole API.
 */
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  seedRuntime,
  type DecoratedPolicy,
} from "@portal/mocks/policies";

export { POLICY_CATEGORIES, POLICY_CONFIG };

/** A decorated, active policy for a category, mirroring the handler's decorate(). */
export function decorateForStory(categoryId: string): DecoratedPolicy {
  const category = POLICY_CATEGORIES.find((c) => c.id === categoryId)!;
  const config = POLICY_CONFIG[categoryId];
  const rt = seedRuntime().pol_security_default;
  return {
    category,
    config,
    state: {
      configured: true,
      status: "active",
      sources: ["editor"],
      scopeTypes: [],
      reviewerEmail: rt.reviewerEmail,
      fieldValues: {},
      outputMode: "new_version",
      outputName: "",
      runOn: "upload",
      backendId: "pol_story",
      isDefault: true,
    },
    steps: config.defaultOperations,
    stats: rt.stats,
    activity: rt.activity,
  };
}
