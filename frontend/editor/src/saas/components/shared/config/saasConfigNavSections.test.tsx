import { describe, it, expect } from "vitest";
import { type TFunction } from "i18next";
import { allowConsole } from "@app/tests/failOnConsole";
import { createSaasConfigNavSections } from "@app/components/shared/config/saasConfigNavSections";

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
  const AI_ITEM_KEYS = [
    "adminAiGeneral",
    "adminAiModels",
    "adminAiDocuments",
    "adminAiLimits",
  ];

  it("never exposes the admin AI settings group or its pages", () => {
    // The shared core nav helper warns it is deprecated; incidental to this test.
    allowConsole.warn(/createConfigNavSections is deprecated/);
    const sections = createSaasConfigNavSections(Overview, () => {}, { t });

    const keys = itemKeys(sections);
    for (const aiKey of AI_ITEM_KEYS) {
      expect(keys).not.toContain(aiKey);
    }
    expect(sections.map((s) => s.title)).not.toContain("AI");
  });

  it("also hides the AI pages for anonymous users", () => {
    allowConsole.warn(/createConfigNavSections is deprecated/);
    const sections = createSaasConfigNavSections(Overview, () => {}, {
      t,
      isAnonymous: true,
    });

    const keys = itemKeys(sections);
    for (const aiKey of AI_ITEM_KEYS) {
      expect(keys).not.toContain(aiKey);
    }
  });
});
