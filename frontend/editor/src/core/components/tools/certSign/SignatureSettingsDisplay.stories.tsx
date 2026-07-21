import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureSettingsDisplay from "@app/components/tools/certSign/SignatureSettingsDisplay";

const meta = {
  title: "CertSign/SignatureSettingsDisplay",
  component: SignatureSettingsDisplay,
} satisfies Meta<typeof SignatureSettingsDisplay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showSignature: true,
    pageNumber: 1,
    reason: "Document approval",
    location: "New York, USA",
    showLogo: true,
  },
};

export const Invisible: Story = {
  args: {
    showSignature: false,
    pageNumber: null,
    reason: null,
    location: null,
    showLogo: false,
  },
};

export const MinimalDetails: Story = {
  args: {
    showSignature: true,
    pageNumber: null,
    reason: null,
    location: null,
    showLogo: false,
  },
};
