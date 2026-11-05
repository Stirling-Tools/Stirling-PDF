import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalSettingsSectionHost } from "@processor/components/settings/PortalSettingsSectionHost";
import { useLinkOptional } from "@processor/contexts/LinkContext";
import { useAccountLinkOptional } from "@processor/contexts/AccountLinkContext";
import { useUI } from "@processor/contexts/UIContext";

vi.mock("@processor/contexts/usePlanTier", () => ({
  usePlanTier: () => "free",
}));

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
