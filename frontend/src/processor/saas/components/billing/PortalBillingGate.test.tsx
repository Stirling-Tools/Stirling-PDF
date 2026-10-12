import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const props = vi.hoisted(() => ({ seen: {} as Record<string, unknown> }));
vi.mock("@app/portal/views/Usage", () => ({
  Usage: (value: Record<string, unknown>) => {
    props.seen = value;
    return <div data-testid="usage" />;
  },
}));
import { BillingSettingsSection } from "@app/portal/components/settings/BillingSettingsSection";
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";

describe("PortalBillingGate — SaaS", () => {
  it("renders hosted billing without any self-hosted renewal or connection actions", () => {
    render(
      <MemoryRouter initialEntries={["/settings/billing"]}>
        <BillingSettingsSection />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("usage")).toBeInTheDocument();
    expect(props.seen.sessionRecovery).toBeUndefined();
    expect(props.seen.onReauth).toBeUndefined();
    expect(useAccountLinkOwner()).toBe(false);
  });
});
