import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationEntry from "@editor/components/tools/automate/AutomationEntry";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, opts?: { title?: string }) =>
      opts?.title ? fallback.replace("{{title}}", opts.title) : fallback,
  }),
}));

describe("AutomationEntry", () => {
  test("shows only the name, with no second line", () => {
    render(
      <MantineProvider>
        <AutomationEntry title="Clean up" onClick={() => {}} />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: "Clean up" }).textContent).toBe(
      "Clean up",
    );
  });

  test("labels the actions menu with the automation's name", () => {
    render(
      <MantineProvider>
        <AutomationEntry
          title="Invoice cleanup"
          onClick={() => {}}
          actions={[
            { key: "edit", label: "Edit", icon: "pencil", onClick: () => {} },
          ]}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Open menu for Invoice cleanup" }),
    ).toBeTruthy();
  });
});
