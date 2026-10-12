import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  usePlanFeatures,
  usePlanHighlights,
} from "@app/constants/planConstants";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe("self-hosted authentication entitlements", () => {
  it("includes OAuth on every tier while reserving SAML for Enterprise", () => {
    const { result } = renderHook(usePlanFeatures);
    for (const tier of ["FREE", "SERVER", "ENTERPRISE"] as const) {
      const features = result.current[tier];
      expect(
        features.find((feature) => feature.name === "SSO (OAuth2/OIDC)")
          ?.included,
      ).toBe(true);
      expect(
        features.find((feature) => feature.name === "SAML")?.included,
      ).toBe(tier === "ENTERPRISE");
    }
  });

  it("advertises free OAuth alongside the existing five-user allowance", () => {
    const { result } = renderHook(usePlanHighlights);
    expect(result.current.FREE).toEqual(
      expect.arrayContaining(["SSO (OAuth2/OIDC)", "Up to 5 users"]),
    );
    expect(result.current.SERVER_MONTHLY).toContain("100 users included");
  });
});
