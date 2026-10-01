import type { Meta, StoryObj } from "@storybook/react-vite";
import RemoveCertificateSignSettings from "@app/components/tools/removeCertificateSign/RemoveCertificateSignSettings";
import { RemoveCertificateSignParameters } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";

const baseParameters: RemoveCertificateSignParameters = {};

const meta = {
  title: "Tools/RemoveCertificateSign/RemoveCertificateSignSettings",
  component: RemoveCertificateSignSettings,
} satisfies Meta<typeof RemoveCertificateSignSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: baseParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: baseParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
