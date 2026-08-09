/**
 * The source picker down the left of the file manager: Recent, local upload,
 * Google Drive and mobile scan.
 *
 * Recent and upload are always offered. The other two are each governed by a
 * pair of config flags — one that enables the integration and one that decides
 * whether an unavailable integration is shown greyed out or dropped from the
 * list entirely. `horizontal` reflows the same buttons into a centred row for
 * the mobile layout and shortens their labels ("Drive", "Mobile").
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileSourceButtons from "@app/components/fileManager/FileSourceButtons";
import { withFileManager } from "@app/components/fileManager/storyFixtures";

/** The column the buttons occupy in the desktop layout. */
const withColumn = (Story: () => ReactElement) => (
  <div style={{ width: "13.625rem", height: "20rem" }}>
    <Story />
  </div>
);

const meta = {
  title: "FileManager/FileSourceButtons",
  component: FileSourceButtons,
  decorators: [withColumn],
} satisfies Meta<typeof FileSourceButtons>;
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The plain build: Recent is the active source, and Drive and mobile scan are
 * both present but disabled because neither is configured.
 */
export const Default: Story = {
  decorators: [withFileManager()],
};

/** Hiding the unavailable integrations leaves only Recent and upload. */
export const UnavailableSourcesHidden: Story = {
  decorators: [
    withFileManager({
      config: {
        hideDisabledToolsGoogleDrive: true,
        hideDisabledToolsMobileQRScanner: true,
      },
    }),
  ],
};

/**
 * Fully configured: Drive takes its coloured icon and both integrations become
 * clickable. Drive needs the client/API/app ids as well as its enable flag.
 */
export const AllSourcesAvailable: Story = {
  decorators: [
    withFileManager({
      config: {
        googleDriveEnabled: true,
        googleDriveClientId: "storybook-client-id",
        googleDriveApiKey: "storybook-api-key",
        googleDriveAppId: "storybook-app-id",
        enableMobileScanner: true,
      },
    }),
  ],
};

/** The mobile layout's row: centred, no heading, and abbreviated labels. */
export const Horizontal: Story = {
  args: { horizontal: true },
  decorators: [withFileManager()],
};
