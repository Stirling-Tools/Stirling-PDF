import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import type { TFunction } from "i18next";
import {
  createPreferencesNavSection,
  extendPreferences,
} from "@app/components/shared/config/configNavSections";
import PreferencesSection, {
  type PreferencesSectionProps,
} from "@app/components/shared/config/configSections/preferences/PreferencesSection";

const t = ((key: string, fallback?: string) =>
  fallback ?? key) as unknown as TFunction<"translation", undefined>;

function page(sections: ReturnType<typeof extendPreferences>) {
  return sections[0].items[0]
    .component as ReactElement<PreferencesSectionProps>;
}

describe("extendPreferences", () => {
  it("keeps what earlier layers passed when a later one adds its own", () => {
    const base = [createPreferencesNavSection(t, { hideAdminBanner: true })];
    const withAccount = extendPreferences(base, { accountSlot: "account" });
    const withUpdates = extendPreferences(withAccount, {
      hideUpdateSection: true,
    });

    const props = page(withUpdates).props;
    expect(page(withUpdates).type).toBe(PreferencesSection);
    expect(props.hideAdminBanner).toBe(true);
    expect(props.accountSlot).toBe("account");
    expect(props.hideUpdateSection).toBe(true);
  });

  it("keeps a wrapper page when a later layer adds props", () => {
    const Wrapper = (_props: PreferencesSectionProps) => null;
    const wrapped = extendPreferences(
      [createPreferencesNavSection(t, { accountSlot: "account" })],
      {},
      Wrapper,
    );
    const extended = extendPreferences(wrapped, { hideAdminBanner: true });

    expect(page(extended).type).toBe(Wrapper);
    expect(page(extended).props.accountSlot).toBe("account");
    expect(page(extended).props.hideAdminBanner).toBe(true);
  });

  it("leaves every other row alone", () => {
    const other = {
      key: "about" as const,
      label: "About",
      icon: "settings" as const,
    };
    const sections = extendPreferences(
      [{ title: "About", items: [{ ...other, component: null }] }],
      {
        accountSlot: "account",
      },
    );
    expect(sections[0].items[0].component).toBeNull();
  });
});
