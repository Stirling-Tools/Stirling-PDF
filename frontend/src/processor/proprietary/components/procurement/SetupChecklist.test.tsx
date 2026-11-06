import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import { SetupChecklist } from "@processor/components/procurement/SetupChecklist";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, vars?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(vars?.[name] ?? ""),
      ),
  }),
  // The copy as plain text, so tests read it the way the buyer does.
  Trans: ({ defaults }: { defaults: string }) =>
    defaults.replace(/<\/?\w+>/g, ""),
}));

const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: PortalTestProviders });

const base = {
  dealId: 7,
  licenseKey: "KEY-123",
  live: false,
  teamSize: 1,
  onInvite: () => {},
  onDownloadOfflineLicense: () => {},
  downloadingLicense: false,
};

describe("SetupChecklist", () => {
  beforeEach(() => window.localStorage.clear());

  it("gives a self-hosted buyer an install command carrying their licence", () => {
    render(<SetupChecklist {...base} deployment="selfhost" />);
    expect(screen.getByText("Install and start Stirling")).toBeInTheDocument();
    expect(screen.getByText(/PREMIUM_KEY=KEY-123/)).toBeInTheDocument();
    expect(screen.queryByText("Invite your team")).not.toBeInTheDocument();
  });

  it("points an air-gapped server at the offline licence file", () => {
    const onDownload = vi.fn();
    render(
      <SetupChecklist
        {...base}
        deployment="airgap"
        onDownloadOfflineLicense={onDownload}
      />,
    );
    expect(
      screen.getByText(/PREMIUM_KEY=file:\/configs\/stirling-enterprise\.lic/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Download licence file" }),
    );
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("remembers a step the buyer ticks, per deal", () => {
    const { unmount } = render(<SetupChecklist {...base} deployment="cloud" />);
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark “Run your first document” done",
      }),
    );
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    unmount();

    render(<SetupChecklist {...base} deployment="cloud" />);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    render(<SetupChecklist {...base} dealId={8} deployment="cloud" />);
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
  });

  it("ticks inviting once a teammate has joined, and keeps it ticked", () => {
    render(<SetupChecklist {...base} deployment="cloud" teamSize={3} />);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark “Invite your team” done" }),
    ).toBeDisabled();
  });
});
