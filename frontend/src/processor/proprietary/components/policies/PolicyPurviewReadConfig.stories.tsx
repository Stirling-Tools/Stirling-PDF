import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PolicyPurviewReadConfig,
  type PurviewReadParams,
} from "@processor/components/policies/PolicyPurviewReadConfig";

const meta: Meta<typeof PolicyPurviewReadConfig> = {
  title: "Portal/Policies/PolicyPurviewReadConfig",
  component: PolicyPurviewReadConfig,
  parameters: { layout: "padded" },
  args: {
    parameters: { connectionId: "" },
    onChange: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PolicyPurviewReadConfig>;

/** Renders the config and keeps its parameters in local state, exercising onChange. */
function Controlled({ parameters }: { parameters: PurviewReadParams }) {
  const [value, setValue] = useState(parameters);
  return <PolicyPurviewReadConfig parameters={value} onChange={setValue} />;
}

export const Empty: Story = {
  render: () => <Controlled parameters={{ connectionId: "" }} />,
};

export const ConnectionSelected: Story = {
  render: () => <Controlled parameters={{ connectionId: "2" }} />,
};
