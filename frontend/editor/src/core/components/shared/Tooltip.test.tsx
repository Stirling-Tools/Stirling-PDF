import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Minimal i18n stub so useTranslation resolves without initializing the real
// instance (this test is about provider-independence, not translations).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

import { Tooltip } from "@app/components/shared/Tooltip";

// The core Tooltip is reused in the Processor portal (via shared tool-settings
// components), which mounts no PreferencesProvider or SidebarProvider. It must
// degrade gracefully instead of throwing "must be used within a ...Provider".
describe("Tooltip without app providers", () => {
  it("mounts outside Preferences/Sidebar providers", () => {
    expect(() =>
      render(
        <MantineProvider>
          <Tooltip content="hello">
            <button type="button">trigger</button>
          </Tooltip>
        </MantineProvider>,
      ),
    ).not.toThrow();
  });

  it("mounts a sidebar-mode tooltip outside a SidebarProvider", () => {
    expect(() =>
      render(
        <MantineProvider>
          <Tooltip sidebarTooltip content="hello">
            <button type="button">trigger</button>
          </Tooltip>
        </MantineProvider>,
      ),
    ).not.toThrow();
  });
});
