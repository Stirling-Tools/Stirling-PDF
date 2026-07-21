import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddPasswordSettings from "@app/components/tools/addPassword/AddPasswordSettings";
import { AddPasswordParameters } from "@app/hooks/tools/addPassword/useAddPasswordParameters";

const meta = {
  title: "Tools/AddPassword/AddPasswordSettings",
  component: AddPasswordSettings,
  args: {
    parameters: { password: "", ownerPassword: "", keyLength: 128 },
    onParameterChange: () => {},
  },
} satisfies Meta<typeof AddPasswordSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the password/key-length inputs interactive in the canvas.
const AddPasswordSettingsDemo = (props: {
  initialParameters: AddPasswordParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<AddPasswordParameters>(
    props.initialParameters,
  );

  return (
    <AddPasswordSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={props.disabled}
    />
  );
};

export const Default: Story = {
  render: () => (
    <AddPasswordSettingsDemo
      initialParameters={{ password: "", ownerPassword: "", keyLength: 128 }}
    />
  ),
};

export const Filled: Story = {
  render: () => (
    <AddPasswordSettingsDemo
      initialParameters={{
        password: "user-secret",
        ownerPassword: "owner-secret",
        keyLength: 256,
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <AddPasswordSettingsDemo
      initialParameters={{
        password: "user-secret",
        ownerPassword: "owner-secret",
        keyLength: 128,
      }}
      disabled
    />
  ),
};
