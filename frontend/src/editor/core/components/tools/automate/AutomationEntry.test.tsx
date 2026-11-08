import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationEntry from "@editor/components/tools/automate/AutomationEntry";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe("AutomationEntry tooltip chain", () => {
  test("keeps each arrow on the same line as the step it points to", async () => {
    render(
      <MantineProvider>
        <AutomationEntry
          title="Clean up"
          operations={["sanitize", "flatten", "compress"]}
          onClick={() => {}}
        />
      </MantineProvider>,
    );

    fireEvent.focusIn(screen.getByRole("button", { name: /Clean up/ }));

    const steps = await screen.findAllByTestId(
      "automation-chain-step",
      {},
      { timeout: 3000 },
    );
    expect(steps.map((step) => step.textContent)).toEqual([
      "sanitize",
      "→flatten",
      "→compress",
    ]);
    for (const step of steps) {
      expect(step.style.whiteSpace).toBe("nowrap");
    }
  });
});
