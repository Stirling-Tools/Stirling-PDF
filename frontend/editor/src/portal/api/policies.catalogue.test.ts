import { describe, it, expect } from "vitest";
import {
  assemblePolicies,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  SHARE_CHANNELS,
  buildWireFromSetup,
  type CatalogueEntry,
} from "@portal/api/policies";

const t = ((key: string) => key) as unknown as Parameters<
  typeof buildWireFromSetup
>[2];

describe("policy catalogue", () => {
  it("gives every category a config", () => {
    // decoratePolicy silently drops a policy whose category has no config, so a
    // category added without one would just never appear.
    for (const category of POLICY_CATEGORIES) {
      expect(POLICY_CONFIG[category.id], category.id).toBeDefined();
    }
  });

  it("carries a sharing category that runs at egress", () => {
    const sharing = POLICY_CATEGORIES.find((c) => c.id === "sharing");
    expect(sharing).toBeDefined();
    expect(sharing?.runsAtEgress).toBe(true);
    expect(sharing?.comingSoon).toBeUndefined();
  });

  it("defaults the sharing policy to the restrictive settings", () => {
    const fields = Object.fromEntries(
      POLICY_CONFIG.sharing.fields.map((f) => [f.key, f.value]),
    );
    expect(fields.defaultAccess).toBe("restricted");
    expect(fields.externalRecipients).toBe("restrict");
    expect(fields.downloads).toBe("allow");
    expect(fields.internalDomains).toEqual([]);
  });

  it("watermarks the outgoing copy by default and offers redaction alongside", () => {
    const tools = POLICY_CONFIG.sharing.defaultOperations.map((s) => s.toolId);
    expect(tools[0]).toBe("watermark");
    expect(tools).toContain("redact");
    expect(tools).toContain("sanitize");
    // Marking the copy is the promised default; scrubbing it is opt-in.
    expect(POLICY_CONFIG.sharing.defaultOn).toEqual(["watermark"]);
  });

  it("ships watermark text so the default policy works unconfigured", () => {
    // The watermark tool rejects an empty text, so a preset without one would
    // fail every run of a freshly created policy.
    const watermark = POLICY_CONFIG.sharing.defaultOperations.find(
      (s) => s.toolId === "watermark",
    );
    expect(watermark?.params).toMatchObject({
      watermarkType: "text",
      watermarkText: expect.stringMatching(/\S/),
    });
  });
});

describe("share channels", () => {
  it("uses the ids the backend ShareChannel enum matches on", () => {
    // These are persisted in the policy's `sources` list and parsed server-side
    // by ShareChannel.fromId, so they are part of the stored format.
    expect(SHARE_CHANNELS.map((c) => c.id)).toEqual([
      "userShare",
      "shareLink",
      "emailShare",
    ]);
  });
});

describe("sharing policy round-trip", () => {
  const entry: CatalogueEntry = {
    category: POLICY_CATEGORIES.find((c) => c.id === "sharing")!,
    config: POLICY_CONFIG.sharing,
    policy: null,
  };

  const wire = buildWireFromSetup(
    entry,
    {
      fieldValues: { defaultAccess: "restricted", externalRecipients: "block" },
      sources: ["shareLink"],
      scopeTypes: ["contract", "nda"],
      reviewerEmail: "",
      outputMode: "new_version",
      outputName: "",
      outputNamePosition: "suffix",
      runOn: "upload",
      maxRetries: 0,
      retryDelayMinutes: 0,
      steps: [{ operation: "/api/v1/security/add-watermark", parameters: {} }],
    },
    t,
  );

  it("carries no trigger - the backend finds egress policies by category", () => {
    expect(wire.trigger).toBeNull();
  });

  it("persists the channels the backend narrows on", () => {
    expect(wire.output.options.sources).toEqual(["shareLink"]);
    expect(wire.output.options.categoryId).toBe("sharing");
  });

  it("round-trips scopeTypes untouched even though nothing sets it yet", () => {
    // No document-type UI ships today, but the field stays in the wire format so
    // an existing value survives an edit rather than being silently dropped.
    expect(wire.output.options.scopeTypes).toEqual(["contract", "nda"]);
  });

  it("survives the catalogue assembly it will be read back through", () => {
    const assembled = assemblePolicies([wire], []);
    const sharing = assembled.catalogue.find(
      (e) => e.category.id === "sharing",
    );
    expect(sharing?.policy).not.toBeNull();
    expect(sharing?.policy?.state.sources).toEqual(["shareLink"]);
    expect(sharing?.policy?.state.scopeTypes).toEqual(["contract", "nda"]);
  });
});
