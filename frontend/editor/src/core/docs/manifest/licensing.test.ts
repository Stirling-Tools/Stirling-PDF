import { describe, expect, it } from "vitest";
import { applyOAuthLicensing } from "@app/docs/manifest/licensing";
import type { DocEntry, DocsManifest } from "@app/docs/manifest/transform";
import manifestRaw from "@app/generated/docsManifest.json?raw";

function manifestWith(markdown: string): DocsManifest {
  const id = "configuration/security/oauth-sso-configuration";
  const doc: DocEntry = {
    id,
    title: "OAuth",
    section: "security",
    sourcePath: "OAuth.md",
    editUrl: "",
    markdown,
  };
  return {
    source: { repo: "docs", ref: "main", root: "docs" },
    nav: [],
    docs: { [id]: doc },
  };
}

describe("bundled OAuth licensing guidance", () => {
  it("corrects every old OAuth tier marker without changing SAML or configuration keys", () => {
    const manifest = manifestWith(
      "> **Tier**: Team\n- [ ] Valid license for the Team tier or higher\n> **Tier**: Team\n- Auto-login feature requires the Team tier (or higher)\nSAML requires Enterprise\nPREMIUM_PROFEATURES_SSOAUTOLOGIN=true",
    );
    applyOAuthLicensing(manifest);
    const text = Object.values(manifest.docs)[0].markdown;
    expect(text.match(/All tiers, including Free/g)).toHaveLength(2);
    expect(text).not.toContain("requires the Team tier");
    expect(text).toContain("existing users can still sign in at the limit");
    expect(text).toContain("SAML requires Enterprise");
    expect(text).toContain("PREMIUM_PROFEATURES_SSOAUTOLOGIN=true");
    const first = JSON.stringify(manifest);
    applyOAuthLicensing(manifest);
    expect(JSON.stringify(manifest)).toBe(first);
  });

  it("leaves the corrected shipped snapshot unchanged on subsequent syncs", () => {
    const manifest = JSON.parse(manifestRaw) as DocsManifest;
    const original = JSON.stringify(manifest);
    applyOAuthLicensing(manifest);
    expect(JSON.stringify(manifest)).toBe(original);
  });
});
