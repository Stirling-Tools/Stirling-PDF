import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  GoogleDriveIcon,
  OneDriveIcon,
  DropboxIcon,
} from "@shared/components/CloudStorageIcons";

const meta: Meta<typeof GoogleDriveIcon> = {
  title: "Primitives/CloudStorageIcons",
  component: GoogleDriveIcon,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { colored: true },
  argTypes: { colored: { control: "boolean" } },
};
export default meta;
type Story = StoryObj<typeof GoogleDriveIcon>;

export const GoogleDrive: Story = {};

/** All providers, brand-coloured vs. muted (inherits `currentColor`). */
export const AllProviders: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 24, fontSize: 32 }}>
      <GoogleDriveIcon width={32} height={32} {...args} />
      <OneDriveIcon width={32} height={32} {...args} />
      <DropboxIcon width={32} height={32} {...args} />
    </div>
  ),
};

/** Uncoloured icons take the surrounding text colour via `currentColor`. */
export const MonochromeInheritsColor: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, fontSize: 32, color: "#6d28d9" }}>
      <GoogleDriveIcon width={32} height={32} />
      <OneDriveIcon width={32} height={32} />
      <DropboxIcon width={32} height={32} />
    </div>
  ),
};
