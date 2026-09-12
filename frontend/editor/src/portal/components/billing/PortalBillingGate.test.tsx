import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";

/**
 * Which usage page this instance has one of. The unlinked half must not go anywhere near the
 * wallet: {@code onWalletLoaded} reports `linked` as a fact, and a browser can hold a SaaS session
 * with no link to this server, so loading a wallet there would flip the whole portal to linked.
 */
const gate = { gated: false, loading: false, available: true };
// Administrator by default: the page is theirs, and one case below is the member.
const admin = { is: true };
const link = { is: false };
const connect = vi.fn();
const applyLinkFacts = vi.fn();

const config = { isAdmin: false, enableLogin: true };
const license = {
  licenseInfo: {
    licenseKey: "test-existing-license" as string | null,
    licenseType: "ENTERPRISE",
  },
  loading: false,
  error: null as string | null,
  refetchLicense: vi.fn(),
};
const saveLicenseKey = vi.fn();
const saveLicenseFile = vi.fn();
const onLicenseSaved = vi.fn();

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config }),
}));
vi.mock("@app/contexts/LicenseContext", () => ({ useLicense: () => license }));
vi.mock("@app/services/licenseService", () => ({
  default: {
    saveLicenseKey: (...args: unknown[]) => saveLicenseKey(...args),
    saveLicenseFile: (...args: unknown[]) => saveLicenseFile(...args),
  },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ ...gate, connect, guard: (f: unknown) => f }),
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => applyLinkFacts,
  useLinkOptional: () => ({ isLinked: link.is }),
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: vi.fn() }),
}));
vi.mock("@portal/hooks/usePortalAdmin", () => ({
  usePortalAdmin: () => admin.is,
}));
vi.mock("@portal/views/Usage", () => ({
  Usage: ({
    onWalletLoaded,
    renderLicenseSection,
  }: {
    onWalletLoaded?: (w: unknown) => void;
    renderLicenseSection?: (onSaved: () => void) => ReactNode;
  }) => {
    onWalletLoaded?.({ status: "free" });
    return (
      <div data-testid="usage">{renderLicenseSection?.(onLicenseSaved)}</div>
    );
  },
}));

vi.mock("@portal/components/billing/FreeTierPlanView", () => ({
  FreeTierPlanView: ({ licenseSection }: { licenseSection?: ReactNode }) => (
    <div data-testid="free-tier">{licenseSection}</div>
  ),
}));

import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function GateTree({ entry = "/processor/usage" }: { entry?: string }) {
  return (
    <MantineProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Location />
        <PortalBillingGate />
      </MemoryRouter>
    </MantineProvider>
  );
}
const renderGate = () => render(<GateTree />);

describe("PortalBillingGate — self-hosted", () => {
  beforeEach(() => {
    admin.is = true;
    link.is = false;
    connect.mockReset();
    applyLinkFacts.mockReset();
    gate.gated = false;
    gate.loading = false;
    config.isAdmin = false;
    config.enableLogin = true;
    license.licenseInfo.licenseKey = "test-existing-license";
    license.loading = false;
    license.error = null;
    license.refetchLicense.mockReset().mockResolvedValue(undefined);
    saveLicenseKey.mockReset().mockResolvedValue({ success: true });
    saveLicenseFile.mockReset().mockResolvedValue({ success: true });
    onLicenseSaved.mockReset();
  });

  it("shows the instance's own meter when there is no account, rather than a bounce", () => {
    gate.gated = true;
    renderGate();
    expect(screen.getByTestId("free-tier")).toBeInTheDocument();
    expect(screen.queryByTestId("usage")).toBeNull();
  });

  it("asks for nothing on the way in", () => {
    gate.gated = true;
    renderGate();
    expect(connect).not.toHaveBeenCalled();
  });

  it("never reports the instance as linked while it is not", () => {
    gate.gated = true;
    renderGate();
    // Keeping the unlinked page off the wallet is what stops the claim.
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });

  it("commits to neither page while the answer is unknown", () => {
    gate.loading = true;
    renderGate();
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(screen.queryByTestId("free-tier")).toBeNull();
  });

  it("renders the wallet page, unchanged, once linked", () => {
    link.is = true;
    renderGate();
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(screen.queryByTestId("free-tier")).toBeNull();
    expect(applyLinkFacts).toHaveBeenCalledWith(true, false);
  });

  it("keeps an unlinked instance off the wallet even when nothing gates it", () => {
    // Linking turned off, or a status check that failed: neither is "gated", and neither may
    // reach a SaaS this instance has no address for.
    gate.gated = false;
    renderGate();

    expect(screen.getByTestId("free-tier")).toBeInTheDocument();
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });

  it("gives a member no page at all, whatever the link state", async () => {
    admin.is = false;
    gate.gated = true;
    renderGate();

    expect(screen.queryByTestId("free-tier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("usage")).not.toBeInTheDocument();
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });
  it.each([null, "", "00000000-0000-0000-0000-000000000000"])(
    "treats %s as empty and discards an unsaved edit on close",
    (key) => {
      config.isAdmin = true;
      link.is = true;
      license.licenseInfo.licenseKey = key;
      renderGate();
      expect(screen.getByText("No license installed")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "View" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(screen.queryByText("Active License")).not.toBeInTheDocument();
      expect(
        screen.queryByText("⚠️ Warning: Existing License Detected"),
      ).not.toBeInTheDocument();
      const input = screen.getByLabelText("License Key", {
        selector: 'input[type="password"]',
      });
      fireEvent.change(input, { target: { value: "unsaved" } });
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(saveLicenseKey).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(
        screen.getByLabelText("License Key", {
          selector: 'input[type="password"]',
        }),
      ).toHaveValue("");
    },
  );

  it("reveals an installed key only when View is opened", () => {
    config.isAdmin = true;
    link.is = true;
    renderGate();
    expect(screen.queryByText("test-existing-license")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByText("test-existing-license")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("test-existing-license")).not.toBeInTheDocument();
  });

  it("shows a certificate filename and exposes its full source in View", () => {
    config.isAdmin = true;
    link.is = true;
    license.licenseInfo.licenseKey = "file:/licenses/enterprise.lic";
    renderGate();
    expect(screen.getByText("enterprise.lic")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByText("/licenses/enterprise.lic")).toBeInTheDocument();
  });

  it("reuses the license-key save flow and refreshes billing after activation", async () => {
    config.isAdmin = true;
    link.is = true;
    renderGate();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Update",
      }),
    );
    expect(screen.getByText("Active License")).toBeInTheDocument();
    expect(
      screen.getByText("⚠️ Warning: Existing License Detected"),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("License Key", {
        selector: 'input[type="password"]',
      }),
      {
        target: { value: " new-test-license " },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await waitFor(() => expect(onLicenseSaved).toHaveBeenCalledTimes(1));
    expect(saveLicenseKey).toHaveBeenCalledWith("new-test-license");
    expect(license.refetchLicense).toHaveBeenCalledTimes(1);
    expect(saveLicenseFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reuses certificate upload instead of sending it as a license string", async () => {
    config.isAdmin = true;
    link.is = true;
    renderGate();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Update",
      }),
    );
    fireEvent.click(
      await screen.findByRole("radio", { name: "Certificate File" }),
    );
    const file = new File(["test-certificate"], "license.lic");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onLicenseSaved).toHaveBeenCalledTimes(1));
    expect(saveLicenseFile).toHaveBeenCalledWith(file);
    expect(saveLicenseKey).not.toHaveBeenCalled();
  });

  it("does not refresh billing when license activation fails", async () => {
    config.isAdmin = true;
    link.is = true;
    saveLicenseKey.mockResolvedValue({
      success: false,
      error: "Invalid license",
    });
    renderGate();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Update",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("License Key", {
        selector: 'input[type="password"]',
      }),
      {
        target: { value: "invalid" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).not.toBeDisabled(),
    );
    expect(license.refetchLicense).not.toHaveBeenCalled();
    expect(onLicenseSaved).not.toHaveBeenCalled();
  });

  it("offers a retry without exposing the form when the current license cannot load", () => {
    config.isAdmin = true;
    link.is = true;
    license.error = "License unavailable";
    renderGate();
    expect(screen.getByText("License unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Update",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(license.refetchLicense).toHaveBeenCalledTimes(1);
  });
  it("keeps local license management available without linking", () => {
    renderGate();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });

  it("prompts once for a procurement link and preserves it when linking completes", () => {
    gate.gated = true;
    const view = render(
      <GateTree entry="/processor/usage?procurement=start" />,
    );
    expect(connect).toHaveBeenCalledTimes(1);
    view.rerender(<GateTree entry="/processor/usage?procurement=start" />);
    expect(connect).toHaveBeenCalledTimes(1);
    link.is = true;
    gate.gated = false;
    view.rerender(<GateTree entry="/processor/usage?procurement=start" />);
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/processor/usage?procurement=start",
    );
  });
});
