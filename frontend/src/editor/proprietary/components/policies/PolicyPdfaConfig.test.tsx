import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PolicyPdfaConfig } from "@editor/components/policies/PolicyPdfaConfig";

const config = vi.hoisted(() => ({ stirlingOfficeConversion: false }));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe("PDF/A policy converter choice", () => {
  test.each([
    [false, undefined, false],
    [true, undefined, true],
    [true, false, false],
    [false, true, true],
  ])("server=%s choice=%s gives checked=%s", (server, choice, checked) => {
    config.stirlingOfficeConversion = server;
    const onChange = vi.fn();
    render(
      <MantineProvider>
        <PolicyPdfaConfig
          parameters={{
            outputFormat: "pdfa-3b",
            useStirlingOfficeConvert: choice,
          }}
          onChange={onChange}
        />
      </MantineProvider>,
    );
    const control = screen.getByTestId("stirling-office-convert-switch");
    expect(control).toHaveProperty("checked", checked);
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith({
      outputFormat: "pdfa-3b",
      useStirlingOfficeConvert: !checked,
    });
  });
});
