import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewSessionStep } from "@app/components/shared/signing/steps/ReviewSessionStep";
import type { FileState } from "@app/types/file";
import type { SignatureSettings } from "@app/components/tools/certSign/SignatureSettingsInput";

const selectedFile: FileState = {
  name: "contract-agreement.pdf",
  size: 2.4 * 1024 * 1024,
};

const signatureSettings: SignatureSettings = {
  showSignature: true,
  pageNumber: 1,
  reason: "Approval of contract terms",
  location: "London, UK",
  showLogo: true,
};

const meta = {
  title: "Shared/Signing/Steps/ReviewSessionStep",
  component: ReviewSessionStep,
  parameters: { layout: "padded" },
  args: {
    selectedFile,
    participantCount: 3,
    signatureSettings,
    dueDate: "2026-08-01",
    onDueDateChange: () => {},
    onBack: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof ReviewSessionStep>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InvisibleSignature: Story = {
  args: {
    signatureSettings: {
      showSignature: false,
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
