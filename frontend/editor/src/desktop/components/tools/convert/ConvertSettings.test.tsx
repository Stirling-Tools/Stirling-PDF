import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ConvertSettings from "@app/components/tools/convert/ConvertSettings";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";

const state = vi.hoisted(() => ({ localOnly: true }));
vi.mock("@app/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { hideUnavailableConversions: false },
  }),
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: () => ({
    endpointStatus: {
      "pdf-to-img": true,
      "pdf-to-word": false,
      "file-to-pdf": false,
    },
  }),
}));
vi.mock("@app/hooks/useConversionCloudStatus", () => ({
  useConversionCloudStatus: () => ({
    availability: {},
    cloudStatus: {},
    localOnly: {},
  }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));

beforeEach(() => {
  state.localOnly = true;
});

function renderSettings() {
  return render(
    <MantineProvider>
      <ConvertSettings
        parameters={{ ...defaultParameters, fromExtension: "pdf" }}
        onParameterChange={vi.fn()}
      />
    </MantineProvider>,
  );
}

it.each([
  ["from", "pdf"],
  ["to", "png"],
])(
  "removes unsupported %s formats under privacy even when the preference is off",
  async (direction, supported) => {
    renderSettings();
    fireEvent.click(screen.getByTestId(`convert-${direction}-dropdown`));
    expect(
      await screen.findByTestId(`format-option-${supported}`),
    ).toBeEnabled();
    expect(screen.queryByTestId("format-option-docx")).toBeNull();
  },
);

it("keeps disabled formats visible when privacy and the hiding preference are off", async () => {
  state.localOnly = false;
  renderSettings();
  fireEvent.click(screen.getByTestId("convert-to-dropdown"));
  expect(await screen.findByTestId("format-option-docx")).toBeDisabled();
  expect(screen.getByTestId("format-option-png")).toBeEnabled();
});
