import type { Meta, StoryObj } from "@storybook/react-vite";
import { CertificateConfigModal } from "@app/components/tools/certSign/modals/CertificateConfigModal";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

const meta = {
  title: "Tools/CertSign/Modals/CertificateConfigModal",
  component: CertificateConfigModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          runningProOrHigher: context.parameters.personalCertificate ?? true,
          serverCertificateEnabled:
            context.parameters.serverCertificate ?? true,
        }}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
  args: {
    opened: true,
    onClose: () => {},
    onSign: async () => {},
    signatureCount: 1,
  },
} satisfies Meta<typeof CertificateConfigModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleSignatures: Story = {
  args: { signatureCount: 3 },
};

export const OrganizationOnly: Story = {
  parameters: { personalCertificate: false },
};

export const UploadOnly: Story = {
  parameters: { personalCertificate: false, serverCertificate: false },
  args: { signatureCount: 0 },
};

export const Disabled: Story = {
  args: { disabled: true },
};
