import { describe, it, expect } from "vitest";

// Resolves through the saas cascade to the cloud impl
// (src/cloud/components/onboarding/saasFlowResolver.ts). No saas-level shadow
// exists, so this exercises the migrated cloud pure-function directly.
import { resolveSaasFlow } from "@app/components/onboarding/saasFlowResolver";
import type { SlideId } from "@app/components/onboarding/saasOnboardingFlowConfig";

describe("resolveSaasFlow — hideDesktopInstall", () => {
  // The four-slide superset (all conditions on) makes the desktop-install
  // toggle the only moving part, so we can assert on a stable slide order.
  const allOn = { showUsageSlide: true, showTeamSlide: true };

  it("KEEPS the desktop-install slide by default (flag omitted)", () => {
    expect(resolveSaasFlow(allOn)).toEqual<SlideId[]>([
      "free-editor",
      "usage",
      "team",
      "desktop-install",
    ]);
  });

  it("KEEPS the desktop-install slide when hideDesktopInstall is explicitly false", () => {
    expect(resolveSaasFlow({ ...allOn, hideDesktopInstall: false })).toEqual<
      SlideId[]
    >(["free-editor", "usage", "team", "desktop-install"]);
  });

  it("OMITS the desktop-install slide when hideDesktopInstall is true", () => {
    expect(resolveSaasFlow({ ...allOn, hideDesktopInstall: true })).toEqual<
      SlideId[]
    >(["free-editor", "usage", "team"]);
  });

  it("leaves the rest of the flow order unchanged — only the trailing slide differs", () => {
    const shown = resolveSaasFlow({ ...allOn, hideDesktopInstall: false });
    const hidden = resolveSaasFlow({ ...allOn, hideDesktopInstall: true });

    // The hidden flow is exactly the shown flow minus its final
    // desktop-install entry — no reordering, no other slides dropped.
    expect(shown[shown.length - 1]).toBe("desktop-install");
    expect(hidden).toEqual(shown.slice(0, -1));
  });

  it("free-editor bookends the flow and hideDesktopInstall is independent of the optional middle slides", () => {
    // Minimal flow: optional slides off, desktop-install hidden → just the
    // free-editor pitch. Confirms the flag composes with the conditionals
    // rather than depending on them.
    expect(
      resolveSaasFlow({
        showUsageSlide: false,
        showTeamSlide: false,
        hideDesktopInstall: true,
      }),
    ).toEqual<SlideId[]>(["free-editor"]);

    // Same conditions but desktop-install shown → free-editor + desktop-install.
    expect(
      resolveSaasFlow({
        showUsageSlide: false,
        showTeamSlide: false,
        hideDesktopInstall: false,
      }),
    ).toEqual<SlideId[]>(["free-editor", "desktop-install"]);
  });
});
