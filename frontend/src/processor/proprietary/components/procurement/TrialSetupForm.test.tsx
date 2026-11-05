import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TrialSetupForm } from "@processor/components/procurement/ProcurementExtras";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function mount() {
  render(
    <MantineProvider>
      <TrialSetupForm
        busy={false}
        initial={{
          deployment: "cloud",
          seats: 5,
          details: { businessName: "Northwind", contactName: "Dana Lee" },
        }}
        onScheduleCall={vi.fn()}
        onConfirm={vi.fn()}
      />
    </MantineProvider>,
  );
  return screen.getByPlaceholderText(
    "portal.procurement.setup.workEmailPlaceholder",
  );
}

describe("TrialSetupForm work email", () => {
  it("says why the trial can't start once an invalid email is left", () => {
    const input = mount();
    fireEvent.change(input, { target: { value: "dana@northwind" } });
    expect(
      screen.queryByText("portal.procurement.emailInvalid"),
    ).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(
      screen.getByText("portal.procurement.emailInvalid"),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "dana@northwind.example" } });
    expect(
      screen.queryByText("portal.procurement.emailInvalid"),
    ).not.toBeInTheDocument();
  });

  it("stays quiet about an empty email the buyer hasn't reached yet", () => {
    const input = mount();
    fireEvent.blur(input);
    expect(
      screen.queryByText("portal.procurement.emailInvalid"),
    ).not.toBeInTheDocument();
  });
});
