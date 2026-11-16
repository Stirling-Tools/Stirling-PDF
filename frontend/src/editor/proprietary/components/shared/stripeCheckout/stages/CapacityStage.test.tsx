import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CapacityStage } from "@editor/components/shared/stripeCheckout/stages/CapacityStage";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
it("allows a reduction at renewal even when current usage exceeds the future allowance", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={1}
        setServerQuantity={() => {}}
        currentUsers={240}
        currentLimit={300}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "100" })).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Review change in Stripe" }),
  ).toBeEnabled();
});

it("shows the new recurring total without inventing the adjustment charge", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={3}
        setServerQuantity={() => {}}
        currentUsers={40}
        currentLimit={300}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("New plan total")).toBeInTheDocument();
  expect(screen.queryByText("Due today")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Stripe will show the exact charge/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review change in Stripe" }),
  ).toBeEnabled();
});
it("keeps payment language for a first purchase", () => {
  render(
    <MantineProvider>
      <CapacityStage
        selectedPlan={null}
        serverQuantity={1}
        setServerQuantity={() => {}}
        onContinue={() => {}}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Estimated total")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeEnabled();
});

it("lets a custom user count be typed without replacing it with rounded blocks", async () => {
  const user = userEvent.setup();
  function Picker() {
    const [quantity, setQuantity] = useState(1);
    return (
      <CapacityStage
        selectedPlan={null}
        serverQuantity={quantity}
        setServerQuantity={setQuantity}
        currentUsers={240}
        onContinue={() => {}}
      />
    );
  }
  render(
    <MantineProvider>
      <Picker />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Custom" }));
  const input = screen.getByRole("textbox", { name: "Number of users" });
  await user.clear(input);
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeDisabled();
  await user.type(input, "245");
  expect(input).toHaveValue("245");
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeEnabled();
});

it.each([
  [undefined, false],
  [{ users: 5, limit: 5 }, false],
  [{ users: 7, limit: 5 }, true],
])(
  "only explains blocked admissions above the supplied allowance",
  (capacityNotice, shown) => {
    render(
      <MantineProvider>
        <CapacityStage
          selectedPlan={null}
          serverQuantity={1}
          setServerQuantity={() => {}}
          onContinue={() => {}}
          capacityNotice={capacityNotice}
        />
      </MantineProvider>,
    );
    expect(
      !!screen.queryByText("Your server has more users than your plan covers"),
    ).toBe(shown);
    expect(!!screen.queryByText(/Existing accounts stay in place/)).toBe(shown);
  },
);

function CustomPicker({ onContactSales }: { onContactSales?: () => void }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <CapacityStage
      selectedPlan={null}
      serverQuantity={quantity}
      setServerQuantity={setQuantity}
      onContinue={() => {}}
      onContactSales={onContactSales}
    />
  );
}

it("turns Custom into a focused input in place of the button", async () => {
  const user = userEvent.setup();
  render(
    <MantineProvider>
      <CustomPicker />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Custom" }));
  expect(screen.queryByRole("button", { name: "Custom" })).toBeNull();
  const input = screen.getByRole("textbox", { name: "Number of users" });
  expect(input).toHaveFocus();
  await user.clear(input);
  await user.type(input, "250");
  expect(screen.getByText(/Rounds up to/)).toBeInTheDocument();
  expect(document.querySelector(".team-capacity__covered")).toHaveTextContent(
    "300",
  );
});

it("asks for a number when the custom entry is empty, without pointing to Enterprise", async () => {
  const user = userEvent.setup();
  render(
    <MantineProvider>
      <CustomPicker onContactSales={() => {}} />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Custom" }));
  await user.clear(screen.getByRole("textbox", { name: "Number of users" }));
  expect(screen.getByText("Enter a number of users.")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /talk to us about Enterprise/ }),
  ).toBeNull();
});

it("points a buyer above the self-serve maximum to Enterprise", async () => {
  const user = userEvent.setup();
  const onContactSales = vi.fn();
  render(
    <MantineProvider>
      <CustomPicker onContactSales={onContactSales} />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Custom" }));
  const input = screen.getByRole("textbox", { name: "Number of users" });
  await user.clear(input);
  await user.type(input, "900");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(
    screen.getByRole("button", { name: "Continue to payment" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: /talk to us about Enterprise/ }),
  );
  expect(onContactSales).toHaveBeenCalledTimes(1);
});
