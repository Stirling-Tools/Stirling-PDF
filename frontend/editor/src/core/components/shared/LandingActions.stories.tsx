/**
 * The row of upload actions on the landing screen. Which buttons appear is
 * decided between props, the app config, and the viewport — the mobile-upload
 * affordance and the browse-files entry are both conditional — so the stories
 * vary those rather than exposing them as controls.
 *
 * The wording and icons come from the file-action hooks, which desktop builds
 * override; these render the web variants.
 */
import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingActions } from "@app/components/shared/LandingActions";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  FilesModalContext,
  type FilesModalContextType,
} from "@app/contexts/FilesModalContext";

/** Enough of the config for the actions to decide what to offer. */
const CONFIG = { storageEnabled: false, enableMobileUpload: true };

function Harness(config: Partial<typeof CONFIG>) {
  return function Wrapped() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    return (
      <AppConfigProvider
        initialConfig={{ ...CONFIG, ...config } as never}
        bootstrapMode="non-blocking"
        autoFetch={false}
      >
        {/* Only openFilesModal is read. The real provider reaches FileContext
            and NavigationContext, so a slice is supplied instead. */}
        <FilesModalContext.Provider
          value={
            { openFilesModal: () => {} } as unknown as FilesModalContextType
          }
        >
          <LandingActions
            fileInputRef={fileInputRef}
            onUploadClick={() => {}}
            onMobileUploadClick={() => {}}
            onFileSelect={() => {}}
          />
        </FilesModalContext.Provider>
      </AppConfigProvider>
    );
  };
}

const meta: Meta<typeof LandingActions> = {
  title: "Shared/LandingActions",
  component: LandingActions,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof LandingActions>;

export const Default: Story = { render: Harness({}) };

/** With storage on, the actions also offer the stored-files browser. */
export const StorageEnabled: Story = {
  render: Harness({ storageEnabled: true }),
};

/** Mobile upload off removes the phone affordance entirely. */
export const NoMobileUpload: Story = {
  render: Harness({ enableMobileUpload: false }),
};

/**
 * Narrow viewports take the mobile branch, which reflows the row and swaps
 * some buttons for icon-only controls.
 */
export const Mobile: Story = {
  render: Harness({}),
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileWithStorage: Story = {
  render: Harness({ storageEnabled: true }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
