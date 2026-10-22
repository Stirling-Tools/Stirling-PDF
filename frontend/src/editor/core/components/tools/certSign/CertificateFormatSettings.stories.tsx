import type { Meta, StoryObj } from "@storybook/react-vite";
import CertificateFormatSettings from "@app/components/tools/certSign/CertificateFormatSettings";
import { defaultParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/CertificateFormatSettings",
  component: CertificateFormatSettings,
} satisfies Meta<typeof CertificateFormatSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const Selected: Story = {
  args: {
    parameters: { ...defaultParameters, certType: "PKCS12" },
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
