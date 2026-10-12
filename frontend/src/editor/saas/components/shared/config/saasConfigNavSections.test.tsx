import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { type TFunction } from "i18next";
import { createSaasConfigNavSections } from "@app/components/shared/config/saasConfigNavSections";
import PreferencesSection, {
  type PreferencesSectionProps,
} from "@core/components/shared/config/configSections/preferences/PreferencesSection";

// Passthrough i18n stub: return the provided fallback (2nd arg) or the key.
const t = ((key: string, fallback?: string) =>
  fallback ?? key) as unknown as TFunction<"translation", undefined>;

const Overview = () => null;

type Sections = ReturnType<typeof createSaasConfigNavSections>;

function itemKeys(sections: Sections): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.key));
}

// Admin AI settings pages exist only in the self-hosted proprietary flavor; this locks in that
// the AI group can never leak into the SaaS nav (fails loudly if wired into the SaaS cascade).
describe("saasConfigNavSections", () => {
  // The four AI rows merged into one; the old keys stay listed so this still
  // fails if an older nav is ever wired back in.
  const AI_ITEM_KEYS = [
    "adminAi",
    "adminAiGeneral",
    "adminAiModels",
    "adminAiDocuments",
    "adminAiLimits",
  ];

  it("never exposes the admin AI settings group or its pages", () => {
    const sections = createSaasConfigNavSections(Overview, () => {}, { t });

    const keys = itemKeys(sections);
    for (const aiKey of AI_ITEM_KEYS) {
      expect(keys).not.toContain(aiKey);
    }
    expect(sections.map((s) => s.title)).not.toContain("AI");
  });

  it("also hides the AI pages for anonymous users", () => {
    const sections = createSaasConfigNavSections(Overview, () => {}, {
      t,
      isAnonymous: true,
    });

    const keys = itemKeys(sections);
    for (const aiKey of AI_ITEM_KEYS) {
      expect(keys).not.toContain(aiKey);
    }
  });

  it("renders Preferences as the one shared page, shortcuts included", () => {
    const sections = createSaasConfigNavSections(Overview, () => {}, { t });

    const preferences = sections.filter((s) => s.id === "preferences");
    expect(preferences).toHaveLength(1);
    expect(preferences[0].items.map((i) => i.key)).toEqual(["general"]);
    expect(itemKeys(sections)).not.toContain("hotkeys");

    const page = preferences[0].items[0]
      .component as ReactElement<PreferencesSectionProps>;
    expect(page.type).toBe(PreferencesSection);
    expect(page.props.hideAdminBanner).toBe(true);
    expect(page.props.hideUpdateSection).toBe(true);
  });

  it("keeps the SaaS account, developer, billing and help sections", () => {
    const keys = itemKeys(
      createSaasConfigNavSections(Overview, () => {}, { t }),
    );
    for (const key of [
      "overview",
      "security",
      "users",
      "api-keys",
      "mcp",
      "plan",
      "help",
      "legal",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
