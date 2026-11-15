import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ConvertToEpubSettings from "@editor/components/tools/convert/ConvertToEpubSettings";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe("ebook output settings", () => {
  test.each(["epub", "azw3"])(
    "%s stays selected when chapter and device settings change",
    (toExtension) => {
      const onParameterChange = vi.fn();
      const outputFormat = toExtension === "azw3" ? "AZW3" : "EPUB";
      render(
        <MantineProvider>
          <ConvertToEpubSettings
            parameters={{
              ...defaultParameters,
              fromExtension: "pdf",
              toExtension,
              epubOptions: {
                detectChapters: true,
                targetDevice: "TABLET_PHONE_IMAGES",
                outputFormat: "EPUB",
              },
            }}
            onParameterChange={onParameterChange}
          />
        </MantineProvider>,
      );
      expect(onParameterChange).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Detect chapters" }),
      );
      expect(onParameterChange).toHaveBeenLastCalledWith("epubOptions", {
        detectChapters: false,
        targetDevice: "TABLET_PHONE_IMAGES",
        outputFormat,
      });
      fireEvent.click(screen.getByRole("textbox", { name: "Target device" }));
      fireEvent.click(
        screen.getByRole("option", { name: "Kindle e-Ink (text optimized)" }),
      );
      expect(onParameterChange).toHaveBeenLastCalledWith("epubOptions", {
        detectChapters: true,
        targetDevice: "KINDLE_EINK_TEXT",
        outputFormat,
      });
    },
  );

  test("the ebook format picker changes the tool target without losing other options", () => {
    const onParameterChange = vi.fn();
    render(
      <MantineProvider>
        <ConvertToEpubSettings
          parameters={{
            ...defaultParameters,
            fromExtension: "pdf",
            toExtension: "epub",
            epubOptions: {
              detectChapters: false,
              targetDevice: "KINDLE_EINK_TEXT",
              outputFormat: "EPUB",
            },
          }}
          onParameterChange={onParameterChange}
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("textbox", { name: "Output format" }));
    fireEvent.click(screen.getByRole("option", { name: "AZW3" }));
    expect(onParameterChange).toHaveBeenCalledWith("toExtension", "azw3");
    expect(onParameterChange).toHaveBeenCalledWith("epubOptions", {
      detectChapters: false,
      targetDevice: "KINDLE_EINK_TEXT",
      outputFormat: "AZW3",
    });
  });
});
