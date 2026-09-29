import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import EditableSecretField from "@app/components/shared/EditableSecretField";

const meta: Meta<typeof EditableSecretField> = {
  title: "Shared/EditableSecretField",
  component: EditableSecretField,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EditableSecretField>;

function SecretFieldDemo({
  initialValue = "",
  ...rest
}: {
  initialValue?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <EditableSecretField
      label="API key"
      description="Used to authenticate requests to the third-party service."
      value={value}
      onChange={setValue}
      {...rest}
    />
  );
}

/** Empty value: renders a normal password input. */
export const Default: Story = {
  render: () => <SecretFieldDemo />,
};

/** Backend returned a masked value (********): shows a read-only display + Edit button. */
export const Masked: Story = {
  render: () => <SecretFieldDemo initialValue="********" />,
};

/** Disabled state — the Edit button on a masked value must still read as inert. */
export const MaskedDisabled: Story = {
  render: () => <SecretFieldDemo initialValue="********" disabled />,
};

/** Validation error surfaced under the password input. */
export const WithError: Story = {
  render: () => <SecretFieldDemo error="Secret value is required." />,
};
