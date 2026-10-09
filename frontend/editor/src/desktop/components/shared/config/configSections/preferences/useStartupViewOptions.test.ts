import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ access: false, view: "tools" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccess: () => h.access,
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: { defaultStartupView: h.view } }),
}));

import { useStartupViewOptions } from "@app/components/shared/config/configSections/preferences/useStartupViewOptions";

const values = () =>
  renderHook(() => useStartupViewOptions()).result.current.map((o) => o.value);

beforeEach(() => {
  h.access = false;
  h.view = "tools";
});

it("offers the Processor to an account that can open it", () => {
  h.access = true;
  expect(values()).toEqual(["tools", "read", "automate", "processor"]);
});

it("does not offer it without access", () => {
  expect(values()).toEqual(["tools", "read", "automate"]);
});

it("still shows it as the choice after access is gone", () => {
  h.view = "processor";
  expect(values()).toContain("processor");
});
