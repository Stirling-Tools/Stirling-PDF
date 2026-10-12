import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DesktopInstallTitle,
  type OSOption,
} from "@app/components/onboarding/slides/DesktopInstallTitle";

const OS_OPTIONS: OSOption[] = [
  { label: "macOS (Apple Silicon)", url: "#mac-arm", value: "mac-arm" },
  { label: "macOS (Intel)", url: "#mac-intel", value: "mac-intel" },
  { label: "Windows", url: "#windows", value: "windows" },
  { label: "Linux", url: "#linux", value: "linux" },
];

const meta = {
  title: "Onboarding/Slides/DesktopInstallTitle",
  component: DesktopInstallTitle,
} satisfies Meta<typeof DesktopInstallTitle>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Multiple OS options: title plus a dropdown to switch the download target. */
export const Default: Story = {
  args: {
    osLabel: "macOS (Apple Silicon)",
    osUrl: "#mac-arm",
    osOptions: OS_OPTIONS,
    onDownloadUrlChange: () => {},
  },
};

/** A single detected OS collapses to plain text — no dropdown affordance. */
export const SingleOption: Story = {
  args: {
    osLabel: "Windows",
    osUrl: "#windows",
    osOptions: [{ label: "Windows", url: "#windows", value: "windows" }],
    onDownloadUrlChange: () => {},
  },
};
