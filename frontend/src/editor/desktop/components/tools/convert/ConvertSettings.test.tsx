import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ConvertSettings from "@editor/components/tools/convert/ConvertSettings";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { ToolActionsContext } from "@editor/contexts/ToolActionsContext";

const state = vi.hoisted(() => ({
  localOnly: true,
  signedOut: false,
  signInEndpoints: ["pdf-to-word"],
}));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { hideUnavailableConversions: false },
  }),
}));
vi.mock("@editor/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: () => ({
    endpointStatus: {
      "pdf-to-img": true,
      "pdf-to-word": false,
      "file-to-pdf": false,
    },
    endpointDetails: state.signedOut
      ? Object.fromEntries(
          state.signInEndpoints.map((endpoint) => [
            endpoint,
            { enabled: false, reason: "NOT_SUPPORTED_LOCALLY" },
          ]),
        )
      : {},
  }),
}));
vi.mock("@editor/hooks/useConversionCloudStatus", () => ({
  useConversionCloudStatus: () => ({
    availability: {},
    cloudStatus: {},
    localOnly: {},
  }),
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));

beforeEach(() => {
  state.localOnly = true;
  state.signedOut = false;
  state.signInEndpoints = ["pdf-to-word"];
});

function renderSettings(
  onEndpointUnavailableClick?: () => void,
  fromExtension = "pdf",
) {
  return render(
    <MantineProvider>
      <ToolActionsContext.Provider value={{ onEndpointUnavailableClick }}>
        <ConvertSettings
          parameters={{ ...defaultParameters, fromExtension }}
          onParameterChange={vi.fn()}
        />
      </ToolActionsContext.Provider>
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

it("offers formats that need sign-in instead of greying them out", async () => {
  state.localOnly = false;
  state.signedOut = true;
  renderSettings(vi.fn());
  fireEvent.click(screen.getByTestId("convert-to-dropdown"));
  const word = await screen.findByTestId("format-option-docx");
  expect(word).toBeEnabled();
  expect(word).toHaveAttribute("title", "convert.signInToUse");
});

it("keeps sign-in formats unavailable under privacy", async () => {
  state.signedOut = true;
  renderSettings(vi.fn());
  fireEvent.click(screen.getByTestId("convert-to-dropdown"));
  await screen.findByTestId("format-option-png");
  expect(screen.queryByTestId("format-option-docx")).toBeNull();
});

it("offers PDF for a dynamic file source that needs sign-in", async () => {
  state.localOnly = false;
  state.signedOut = true;
  state.signInEndpoints = ["file-to-pdf"];
  renderSettings(vi.fn(), "file-docm");
  fireEvent.click(screen.getByTestId("convert-to-dropdown"));
  const pdf = await screen.findByTestId("format-option-pdf");
  expect(pdf).toBeEnabled();
  expect(pdf).toHaveAttribute("title", "convert.signInToUse");
});

it("locks source formats reachable only by signing in", async () => {
  state.localOnly = false;
  state.signedOut = true;
  state.signInEndpoints = ["file-to-pdf"];
  renderSettings(vi.fn());
  fireEvent.click(screen.getByTestId("convert-from-dropdown"));
  const docx = await screen.findByTestId("format-option-docx");
  expect(docx).toBeEnabled();
  expect(docx).toHaveAttribute("title", "convert.signInToUse");
  const pdf = screen.getByTestId("format-option-pdf");
  expect(pdf).toBeEnabled();
  expect(pdf).not.toHaveAttribute("title");
});
