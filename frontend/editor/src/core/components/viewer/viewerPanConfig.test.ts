import { describe, expect, it } from "vitest";
import { PanPluginPackage } from "@embedpdf/plugin-pan";
import { VIEWER_PAN_CONFIG } from "@app/components/viewer/viewerPanConfig";

describe("viewer pan plugin config", () => {
  it("overrides the plugin default so pan never becomes the interaction default", () => {
    expect(VIEWER_PAN_CONFIG.defaultMode).toBe("never");
  });

  // Canary: if upstream ever ships a safe default, this override can go.
  it("still needs the override because the plugin ships defaultMode mobile", () => {
    expect(PanPluginPackage.manifest.defaultConfig.defaultMode).toBe("mobile");
  });
});
