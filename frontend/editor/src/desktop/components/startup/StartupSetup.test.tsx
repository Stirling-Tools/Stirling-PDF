import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartupSetup } from "@app/components/startup/StartupSetup";

const h = vi.hoisted(() => ({
  saas: false,
  appVersion: undefined as string | undefined,
  setup: vi.fn(),
}));
vi.mock("@app/hooks/useSaaSMode", () => ({ useSaaSMode: () => h.saas }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { appVersion: h.appVersion } }),
}));
vi.mock("@core/components/startup/StartupSetup", () => ({
  StartupSetup: (props: {
    children: ReactNode;
    refreshConfigOnMount: boolean;
  }) => {
    h.setup(props.refreshConfigOnMount);
    return <>{props.children}</>;
  },
}));
beforeEach(() => {
  h.saas = false;
  h.appVersion = undefined;
  h.setup.mockClear();
});
afterEach(cleanup);

it("waits for desktop config readiness without fetching the bundled backend", () => {
  const view = render(<StartupSetup>Consent</StartupSetup>);
  expect(h.setup).not.toHaveBeenCalled();
  h.appVersion = "1.0";
  view.rerender(<StartupSetup>Consent</StartupSetup>);
  expect(h.setup).toHaveBeenCalledWith(false);
});

it("leaves hosted account setup to the identity provider", () => {
  h.saas = true;
  h.appVersion = "1.0";
  render(<StartupSetup>Consent</StartupSetup>);
  expect(screen.getByText("Consent")).toBeVisible();
  expect(h.setup).not.toHaveBeenCalled();
});
