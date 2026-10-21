import type { Meta, StoryObj } from "@storybook/react-vite";
import { UpdateStartupPopup } from "@app/components/shared/UpdateStartupPopup";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

/**
 * Startup update-check popup — renders null until an update is detected, so
 * every story here shows an empty canvas. The stories exercise the gating
 * logic (`isUpdatePopupAllowed`) rather than the (invisible) update-found UI,
 * which additionally requires a real startup delay + network round trip.
 */
const meta = {
  title: "Shared/UpdateStartupPopup",
  component: UpdateStartupPopup,
} satisfies Meta<typeof UpdateStartupPopup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No app config resolved yet — gate is closed, renders nothing. */
export const Default: Story = {};

/** Config resolved but `shouldShowUpdate` is false — gate stays closed. */
export const UpdatesDisabled: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          appVersion: "1.2.3",
          shouldShowUpdate: false,
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/**
 * Gate is open (`shouldShowUpdate: true`), so the startup timer would fire and
 * check for an update — but the modal itself only appears once that check
 * resolves with a newer version, well after the 15s startup delay.
 */
export const UpdatesEnabled: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          appVersion: "1.2.3",
          shouldShowUpdate: true,
          machineType: "docker",
          activeSecurity: false,
          license: "NORMAL",
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};
