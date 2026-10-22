import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementSnapshot } from "@portal/api/procurement";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, value?: string | { count?: number }) => {
      if (typeof value === "string") return value;
      if (key === "portal.procurement.journey.daysLeft")
        return `${value?.count} days left`;
      return key;
    },
  }),
}));
vi.mock("@portal/components/procurement/CalendlyInline", () => ({
  warmCalendly: vi.fn(),
}));

const snapshot: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "selfhost",
  seats: 100,
  trialStartedAt: "2026-09-01T00:00:00Z",
  trialEndsAt: "2026-09-18T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: true,
  licenseKey: "trial-license",
  agreementSignedVersion: null,
  businessName: null,
  contactName: null,
  contactEmail: null,
  latestQuote: null,
};

function mount(overrides: Partial<ProcurementSnapshot> = {}, readOnly = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
  const onManageTrial = vi.fn();
  const onDocuments = vi.fn();
  render(
    <MantineProvider>
      <DealStatusHero
        snapshot={{ ...snapshot, ...overrides }}
        readOnly={readOnly}
        canSchedule={false}
        onExpand={vi.fn()}
        onAcceptQuote={vi.fn()}
        onLicense={vi.fn()}
        onInvite={vi.fn()}
        onSchedule={vi.fn()}
        onManageTrial={onManageTrial}
        onDocuments={onDocuments}
      />
    </MantineProvider>,
  );
  return { onManageTrial, onDocuments };
}

afterEach(() => vi.useRealTimers());

describe("DealStatusHero trial status", () => {
  it("preserves the trial-management action and document icon", () => {
    const { onManageTrial, onDocuments } = mount();
    fireEvent.click(screen.getByRole("button", { name: "7 days left" }));
    expect(onManageTrial).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "portal.procurement.hero.documents" }),
    );
    expect(onDocuments).toHaveBeenCalledOnce();
  });

  it.each(["trial", "quote", "security"] as const)(
    "shows expiry during %s without using the licensed flag as proof of validity",
    (stage) => {
      mount({ stage, trialEndsAt: "2026-09-10T00:00:00Z" });
      expect(screen.getByText("Trial expired")).toBeInTheDocument();
    },
  );

  it("does not offer trial extensions after the deal advances to quote", () => {
    mount({ stage: "quote" });
    expect(screen.getByText("7 days left")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "7 days left" }),
    ).not.toBeInTheDocument();
  });

  it.each(["exploring", "procurement", "active"] as const)(
    "does not label %s using a historical trial date",
    (stage) => {
      mount({ stage, trialEndsAt: "2026-09-10T00:00:00Z" });
      expect(screen.queryByText("Trial expired")).not.toBeInTheDocument();
    },
  );

  it("shows the member's trial status without mutation actions", () => {
    mount({}, true);
    expect(screen.getByText("7 days left")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
