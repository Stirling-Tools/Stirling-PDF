import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalSettingsSectionHost } from "@portal/components/settings/PortalSettingsSectionHost";
import { useLinkOptional } from "@portal/contexts/LinkContext";
import { useAccountLinkOptional } from "@portal/contexts/AccountLinkContext";
import { useUI } from "@portal/contexts/UIContext";

vi.mock("@portal/contexts/usePlanTier", () => ({ usePlanTier: () => "free" }));

function AccountState() {
  const link = useLinkOptional();
  const accountLink = useAccountLinkOptional();
  const ui = useUI();
  return (
    <output>
      {!link && !accountLink && !ui.linkModalOpen
        ? "cloud account"
        : "instance link"}
    </output>
  );
}

describe("SaaS settings providers", () => {
  it("supplies the billing UI without instance-link state or requests", () => {
    render(
      <PortalSettingsSectionHost>
        <AccountState />
      </PortalSettingsSectionHost>,
    );
    expect(screen.getByText("cloud account")).toBeInTheDocument();
  });
});
