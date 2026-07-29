import type { Meta, StoryObj } from "@storybook/react-vite";
import ValidateSignatureSettings from "@app/components/tools/validateSignature/ValidateSignatureSettings";
import { ValidateSignatureParameters } from "@app/hooks/tools/validateSignature/useValidateSignatureParameters";

const meta = {
  title: "Tools/ValidateSignature/ValidateSignatureSettings",
  component: ValidateSignatureSettings,
} satisfies Meta<typeof ValidateSignatureSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

const buildParameters = (
  overrides: Partial<ValidateSignatureParameters> = {},
): ValidateSignatureParameters => ({
  certFile: null,
  ...overrides,
});

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const WithCertFile: Story = {
  args: {
    parameters: buildParameters({
      certFile: new File(["cert-data"], "trusted-root.crt", {
        type: "application/x-x509-ca-cert",
      }),
    }),
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
    disabled: true,
  },
};
