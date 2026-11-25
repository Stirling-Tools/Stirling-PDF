import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PolicyPdfaConfig } from "@editor/components/policies/PolicyPdfaConfig";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function renderConfig(onChange = vi.fn()) {
  render(
    <MantineProvider>
      <PolicyPdfaConfig
        parameters={{ outputFormat: "pdfa-3b" }}
        onChange={onChange}
      />
    </MantineProvider>,
  );
  return onChange;
}

describe("PDF/A policy settings", () => {
  test("shows the stored profile", () => {
    renderConfig();
    expect(screen.getByRole("textbox")).toHaveProperty("value", "pdfa-3b");
  });

  test.each(["pdfa-1", "pdfa-2b"])("picking %s stores that profile", (pick) => {
    const onChange = renderConfig();
    fireEvent.click(screen.getByRole("textbox"));
    fireEvent.click(screen.getByRole("option", { name: pick }));
    expect(onChange).toHaveBeenCalledWith({ outputFormat: pick });
  });

  test("offers no converter choice", () => {
    renderConfig();
    expect(screen.queryByTestId("stirling-office-convert-switch")).toBeNull();
  });
});
