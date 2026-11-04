import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { DealStatusHero } from "@processor/components/procurement/DealStatusHero";
import type { ProcurementSnapshot } from "@processor/api/procurement";

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

function mount(overrides: Partial<ProcurementSnapshot> = {}, member = false) {
  const onOpen = vi.fn();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
  render(
    <MantineProvider>
      <DealStatusHero
        snapshot={{ ...snapshot, ...overrides }}
        onOpen={member ? undefined : onOpen}
      />
    </MantineProvider>,
  );
  return { onOpen };
}

afterEach(() => vi.useRealTimers());

describe("DealStatusHero", () => {
  it("opens the Enterprise page from its one action", () => {
    const { onOpen } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "portal.procurement.hero.open" }),
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it.each(["trial", "quote", "security"] as const)(
    "shows expiry during %s without using the licensed flag as proof of validity",
    (stage) => {
      mount({ stage, trialEndsAt: "2026-09-10T00:00:00Z" });
      expect(screen.getByText("Trial expired")).toBeInTheDocument();
    },
  );

  it.each(["exploring", "procurement", "active"] as const)(
    "does not label %s using a historical trial date",
    (stage) => {
      mount({ stage, trialEndsAt: "2026-09-10T00:00:00Z" });
      expect(screen.queryByText("Trial expired")).not.toBeInTheDocument();
    },
  );

  it("shows a member the trial status with no way into the deal", () => {
    mount({}, true);
    expect(screen.getByText("7 days left")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
