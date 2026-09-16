import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcessorSettingsSectionHost } from "@processor/components/settings/ProcessorSettingsSectionHost";
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
      <ProcessorSettingsSectionHost>
        <AccountState />
      </ProcessorSettingsSectionHost>,
    );
    expect(screen.getByText("cloud account")).toBeInTheDocument();
  });
});
