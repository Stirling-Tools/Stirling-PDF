import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  GoogleDriveIcon,
  OneDriveIcon,
  DropboxIcon,
} from "@app/components/shared/CloudStorageIcons";

/** Cloud storage brand icons with brand-color / muted current-color variants. */
const meta: Meta<typeof GoogleDriveIcon> = {
  title: "Shared/CloudStorageIcons",
  component: GoogleDriveIcon,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const GoogleDrive: Story = {
  args: { colored: true },
};

export const GoogleDriveMuted: Story = {
  args: { colored: false },
};

export const OneDrive: Story = {
  render: (args) => <OneDriveIcon {...args} />,
  args: { colored: true },
};

export const Dropbox: Story = {
  render: (args) => <DropboxIcon {...args} />,
  args: { colored: true },
};
