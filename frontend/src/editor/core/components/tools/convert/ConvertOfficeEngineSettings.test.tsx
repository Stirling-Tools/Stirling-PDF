import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ConvertOfficeEngineSettings from "@editor/components/tools/convert/ConvertOfficeEngineSettings";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";

const config = vi.hoisted(() => ({ stirlingOfficeConversion: false }));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe("Office conversion engine setting", () => {
  test.each([
    [false, undefined, false],
    [true, undefined, true],
    [true, false, false],
    [false, true, true],
  ])("server=%s, choice=%s gives checked=%s", (server, choice, checked) => {
    config.stirlingOfficeConversion = server;
    const onParameterChange = vi.fn();
    render(
      <MantineProvider>
        <ConvertOfficeEngineSettings
          parameters={{
            ...defaultParameters,
            useStirlingOfficeConvert: choice,
          }}
          onParameterChange={onParameterChange}
        />
      </MantineProvider>,
    );
    const control = screen.getByTestId("stirling-office-convert-switch");
    expect(control).toHaveProperty("checked", checked);
    fireEvent.click(control);
    expect(onParameterChange).toHaveBeenCalledWith(
      "useStirlingOfficeConvert",
      !checked,
    );
  });

  test("disables the choice during processing", () => {
    render(
      <MantineProvider>
        <ConvertOfficeEngineSettings
          parameters={defaultParameters}
          onParameterChange={vi.fn()}
          disabled
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId("stirling-office-convert-switch")).toHaveProperty(
      "disabled",
      true,
    );
  });
});
