import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PolicyPurviewConfig,
  type PurviewLabelParams,
} from "@processor/components/policies/PolicyPurviewConfig";

const meta: Meta<typeof PolicyPurviewConfig> = {
  title: "Processor/Policies/PolicyPurviewConfig",
  component: PolicyPurviewConfig,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyPurviewConfig>;

/** Renders the config and keeps its parameters in local state, exercising onChange. */
function Controlled({ parameters }: { parameters: PurviewLabelParams }) {
  const [value, setValue] = useState(parameters);
  return <PolicyPurviewConfig parameters={value} onChange={setValue} />;
}

export const Empty: Story = {
  render: () => (
    <Controlled
      parameters={{
        connectionId: "",
        labelId: "",
        labelName: "",
        method: "STANDARD",
      }}
    />
  ),
};

export const Configured: Story = {
  render: () => (
    <Controlled
      parameters={{
        connectionId: "2",
        labelId: "2096f6a2-d2f7-48be-b329-b73aaa526e5d",
        labelName: "Confidential",
        method: "PRIVILEGED",
      }}
    />
  ),
};
