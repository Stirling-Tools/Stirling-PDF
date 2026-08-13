import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import {
  assemblePolicies,
  buildWireFromState,
  type CatalogueEntry,
  type DecoratedPolicy,
} from "@portal/api/policies";
import type { WirePolicy } from "@app/policies/types";

const t = ((key: string) => key) as unknown as TFunction;

/**
 * A record saved before the wire carried `inputs`: the selection only ever
 * reached the backend as display metadata in `output.options.sources`, which is
 * unvalidated, so it can name more sources than the one-input cap allows.
 */
const LEGACY_MULTI_SOURCE: WirePolicy = {
  id: "pol_legacy",
  name: "Security Policy",
  owner: "security@acme.com",
  enabled: true,
  inputs: [],
  steps: [
    { operation: "/api/v1/security/auto-redact", parameters: { mode: "auto" } },
  ],
  output: {
    type: "inline",
    options: {
      runOn: "export",
      mode: "new_version",
      name: "",
      position: "suffix",
      categoryId: "security",
      sources: ["editor", "src-claims", "src-contracts"],
      scopeTypes: [],
      reviewerEmail: "",
      fieldValues: {},
    },
  },
};

/** The same policy after a wizard save, which binds exactly one real source. */
const BOUND_SINGLE_SOURCE: WirePolicy = {
  ...LEGACY_MULTI_SOURCE,
  id: "pol_bound",
  inputs: [
    { sourceId: "src-claims", trigger: { type: "folder-watch", options: {} } },
  ],
  output: {
    type: "inline",
    options: {
      ...LEGACY_MULTI_SOURCE.output.options,
      sources: ["editor", "src-claims"],
    },
  },
};

function decorate(wire: WirePolicy): {
  entry: CatalogueEntry;
  policy: DecoratedPolicy;
} {
  const { catalogue } = assemblePolicies([wire], []);
  const entry = catalogue.find((c) => c.policy !== null);
  if (!entry?.policy) throw new Error("policy did not decode");
  return { entry, policy: entry.policy };
}

/** Pausing/resuming saves the whole policy, so its body must still be valid. */
describe("buildWireFromState (pause/resume)", () => {
  it("stays within the backend one-input cap for a legacy multi-source policy", () => {
    const { entry, policy } = decorate(LEGACY_MULTI_SOURCE);

    const wire = buildWireFromState(entry, policy, false, t);

    expect(wire.inputs.length).toBeLessThanOrEqual(1);
  });

  it("does not bind new inputs when a multi-source policy is paused", () => {
    const { entry, policy } = decorate(LEGACY_MULTI_SOURCE);

    const wire = buildWireFromState(entry, policy, false, t);

    expect(wire.inputs).toEqual([]);
    expect(wire.enabled).toBe(false);
  });

  it("keeps the saved source selection through a pause", () => {
    const { entry, policy } = decorate(LEGACY_MULTI_SOURCE);

    const wire = buildWireFromState(entry, policy, false, t);

    expect(wire.output.options.sources).toEqual([
      "editor",
      "src-claims",
      "src-contracts",
    ]);
  });

  it("resumes a legacy multi-source policy without rebinding it", () => {
    const { entry, policy } = decorate(LEGACY_MULTI_SOURCE);

    const wire = buildWireFromState(entry, policy, true, t);

    expect(wire.inputs).toEqual([]);
    expect(wire.enabled).toBe(true);
  });

  it("replays a bound policy's input and trigger unchanged", () => {
    const { entry, policy } = decorate(BOUND_SINGLE_SOURCE);

    const wire = buildWireFromState(entry, policy, false, t);

    expect(wire.inputs).toEqual(BOUND_SINGLE_SOURCE.inputs);
  });
});
