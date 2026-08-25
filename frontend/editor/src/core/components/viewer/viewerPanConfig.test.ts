import { describe, expect, it } from "vitest";
import { PanPluginPackage } from "@embedpdf/plugin-pan";
import { VIEWER_PAN_CONFIG } from "@app/components/viewer/viewerPanConfig";

describe("viewer pan plugin config", () => {
  it("resolves defaultMode to never so pan never becomes the interaction default", () => {
    const resolved = {
      ...PanPluginPackage.manifest.defaultConfig,
      ...VIEWER_PAN_CONFIG,
    };

    expect(resolved.defaultMode).toBe("never");
  });
});
