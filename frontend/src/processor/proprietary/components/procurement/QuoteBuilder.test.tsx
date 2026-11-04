import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { QuoteConfigInput, QuoteResult } from "@processor/api/procurement";
import { QuoteBuilder } from "@processor/components/procurement/QuoteBuilder";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, value?: unknown, options?: Record<string, unknown>) => {
      const vars =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : (options ?? {});
      const text = typeof value === "string" ? value : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name]));
    },
    i18n: { language: "en-US" },
  }),
}));

const { buildQuote } = vi.hoisted(() => ({ buildQuote: vi.fn() }));
vi.mock("@processor/api/procurement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@processor/api/procurement")>()),
  buildQuote,
}));

/** A cloud quote for a handful of users, with every detail filled so it can be generated. */
const smallQuote: QuoteConfigInput = {
  volume: 10_000,
  users: 5,
  intensity: 4,
  sizeMult: 1.4,
  deployment: "cloud",
  termYears: 3,
  serviceLevel: "standard",
  indemnification: false,
  training: false,
  qbr: false,
  businessName: "Northwind",
  contactName: "Dana Lee",
  contactEmail: "dana@northwind.example",
  addressLine1: "1 Main St",
  city: "Springfield",
  region: "IL",
  postalCode: "62701",
};

function mount(
  onComparePlans = vi.fn(),
  initial: QuoteConfigInput | null = smallQuote,
  onScheduleCall = vi.fn(),
) {
  render(
    <MantineProvider>
      <QuoteBuilder
        deployment="cloud"
        seats={5}
        initial={initial ?? undefined}
        eulaAlreadyAgreed
        minAnnualMinor={1_200_000}
        onComparePlans={onComparePlans}
        onScheduleCall={onScheduleCall}
        onGenerate={vi.fn()}
      />
    </MantineProvider>,
  );
}

const generate = () =>
  screen.getByRole("button", { name: "portal.procurement.builder.generate" });

describe("QuoteBuilder chrome", () => {
  it("has no close: a quote in progress is left through the page, not dismissed", () => {
    mount();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });

  it("words the issued quote's lines through translations, keeping unknown ones as sent", () => {
    const issued: QuoteResult = {
      quoteId: 1,
      quoteNumber: "QT-1",
      status: "sent",
      currency: "usd",
      annualNetMinor: 1_600_000,
      tcvMinor: 4_800_000,
      renewalAnnualNetMinor: 1_650_000,
      cpiRatePct: 3,
      lineItems: [
        {
          key: "usage",
          label: "server usage",
          kind: "RECURRING",
          amountMinor: 1,
        },
        {
          key: "seats",
          label: "server seats",
          kind: "INCLUDED",
          amountMinor: 0,
        },
        {
          key: "deployment",
          label: "server deploy",
          kind: "RECURRING",
          amountMinor: 1,
        },
        {
          key: "new-thing",
          label: "Something new",
          kind: "RECURRING",
          amountMinor: 1,
        },
      ],
      validUntil: null,
      stripeQuoteId: "qt_1",
      invoiceUrl: null,
      invoicePdf: null,
      config: { ...smallQuote, deployment: "selfhost" },
    };
    render(
      <MantineProvider>
        <QuoteBuilder
          deployment="selfhost"
          seats={5}
          initial={issued.config}
          eulaAlreadyAgreed
          minAnnualMinor={0}
          issued={issued}
          onGenerate={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.queryByText("server usage")).not.toBeInTheDocument();
    expect(
      screen.getByText("portal.procurement.builder.line.usage"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.procurement.builder.line.seats"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.procurement.builder.line.deployment"),
    ).toBeInTheDocument();
    expect(screen.getByText("Something new")).toBeInTheDocument();
  });
});

describe("QuoteBuilder minimum deal size", () => {
  it("only notes where Enterprise starts while the buyer is still sizing the quote", () => {
    mount();
    expect(
      screen.getByText(
        /^Enterprise requires a minimum yearly spend of \D*12,000\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compare plans" }),
    ).not.toBeInTheDocument();
  });

  it("explains the minimum and leads to the self-serve plans when a too-small quote is generated", () => {
    const onComparePlans = vi.fn();
    mount(onComparePlans);
    fireEvent.click(generate());

    expect(buildQuote).not.toHaveBeenCalled();
    expect(screen.getByText(/^This quote comes to /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
    expect(onComparePlans).toHaveBeenCalledOnce();
  });

  it("lets the buyer continue past a too-small quote, warning them as they go", () => {
    mount(vi.fn(), null);
    expect(screen.queryByText(/^This quote comes to /)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.procurement.builder.continue",
      }),
    );
    expect(screen.getByText(/^This quote comes to /)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "portal.procurement.builder.continue",
      }),
    ).toBeEnabled();
  });

  it("helps a quote just short of the minimum over it, or into a call", () => {
    const onScheduleCall = vi.fn();
    // About $10,100 a year: inside the near band.
    mount(vi.fn(), { ...smallQuote, volume: 190_000 }, onScheduleCall);
    fireEvent.click(generate());

    expect(
      screen.getByText(/a year short of Enterprise\.$/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.procurement.hero.scheduleCall",
      }),
    );
    expect(onScheduleCall).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Raise estimated usage" }),
    );
    expect(
      screen.queryByText(/a year short of Enterprise/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Enterprise requires/)).not.toBeInTheDocument();
  });
});

describe("QuoteBuilder generate errors", () => {
  it("offers the self-serve plans only when the server refuses the deal for its size", async () => {
    buildQuote.mockRejectedValueOnce(new Error("Network down"));
    mount(vi.fn(), { ...smallQuote, volume: 900_000 });
    fireEvent.click(generate());
    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compare plans" }),
    ).not.toBeInTheDocument();
  });
});

describe("QuoteBuilder sizing", () => {
  const field = (name: string) =>
    screen.getByLabelText(`portal.procurement.builder.${name}`);

  it("re-estimates volume from the team size even after a manual figure", () => {
    mount(vi.fn(), null);
    fireEvent.change(field("volume"), { target: { value: "999999" } });
    fireEvent.change(field("users"), { target: { value: "50" } });
    expect(field("volume")).not.toHaveValue(999_999);
  });

  it("shows one-time onboarding beside a one-year total", () => {
    mount(vi.fn(), null);
    fireEvent.click(
      screen.getByRole("button", {
        name: "portal.procurement.builder.continue",
      }),
    );
    const oneTime = "portal.procurement.builder.addonOneTime";
    expect(screen.queryByText(oneTime)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("portal.procurement.builder.training"));
    expect(screen.getByText(oneTime)).toBeInTheDocument();
  });
});
