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
      screen.queryByText("portal.procurement.validation.email"),
    ).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(
      screen.getByText("portal.procurement.validation.email"),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "dana@northwind.example" } });
    expect(
      screen.queryByText("portal.procurement.validation.email"),
    ).not.toBeInTheDocument();
  });

  it("stays quiet about an empty email the buyer hasn't reached yet", () => {
    const input = mount();
    fireEvent.blur(input);
    expect(
      screen.queryByText("portal.procurement.validation.email"),
    ).not.toBeInTheDocument();
  });
});

describe("TrialSetupForm blocked steps", () => {
  it("keeps Continue clickable and asks for the head count instead of moving on", () => {
    render(
      <MantineProvider>
        <TrialSetupForm
          busy={false}
          onScheduleCall={vi.fn()}
          onConfirm={vi.fn()}
        />
      </MantineProvider>,
    );
    const next = screen.getByRole("button", {
      name: "portal.procurement.setup.continue",
    });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(
      screen.getByText("portal.procurement.validation.seats"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        "portal.procurement.setup.workEmailPlaceholder",
      ),
    ).not.toBeInTheDocument();
  });

  it("names every missing detail and the EULA instead of starting the trial", () => {
    const onConfirm = vi.fn();
    render(
      <MantineProvider>
        <TrialSetupForm
          busy={false}
          initial={{ deployment: "cloud", seats: 5, details: {} }}
          onScheduleCall={vi.fn()}
          onConfirm={onConfirm}
        />
      </MantineProvider>,
    );
    const startButton = screen.getByRole("button", {
      name: "portal.procurement.setup.start",
    });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("portal.procurement.validation.required"),
    ).toHaveLength(3);
    expect(
      screen.getByText("portal.procurement.validation.eula"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "portal.procurement.setup.fullNamePlaceholder",
      ),
    ).toHaveAttribute("aria-invalid", "true");
  });
});
