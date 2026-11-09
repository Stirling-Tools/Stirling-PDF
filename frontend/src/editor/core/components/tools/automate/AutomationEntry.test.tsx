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

describe("AutomationEntry subtitle", () => {
  test("shows the subtitle under a title capped at two lines", () => {
    render(
      <MantineProvider>
        <AutomationEntry
          title="OCR → Compress → Add Password"
          subtitle="You ran this 38 times"
          operations={["ocr", "compress", "addPassword"]}
          onClick={() => {}}
        />
      </MantineProvider>,
    );

    const title = screen.getByText("OCR → Compress → Add Password");
    const subtitle = screen.getByText("You ran this 38 times");
    expect(title.getAttribute("data-line-clamp")).toBe("true");
    expect(title.style.getPropertyValue("--text-line-clamp")).toBe("2");
    expect(
      title.compareDocumentPosition(subtitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
