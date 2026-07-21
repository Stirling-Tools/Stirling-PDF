import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PolicyField } from "@portal/api/policies";
import { PolicyFieldRow } from "@portal/components/policies/PolicyFieldRow";

const meta: Meta<typeof PolicyFieldRow> = {
  title: "Portal/Policies/PolicyFieldRow",
  component: PolicyFieldRow,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyFieldRow>;

/** Renders the field and keeps its value in local state, exercising onChange. */
function Controlled({ field }: { field: PolicyField }) {
  const [value, setValue] = useState(field.value);
  return <PolicyFieldRow field={field} value={value} onChange={setValue} />;
}

export const Toggle: Story = {
  render: () => (
    <Controlled
      field={{
        key: "auditTrail",
        label: "Audit trail",
        type: "toggle",
        value: true,
      }}
    />
  ),
};

export const Select: Story = {
  render: () => (
    <Controlled
      field={{
        key: "keepFor",
        label: "Keep for",
        type: "select",
        value: "7 years",
        options: ["30 days", "1 year", "7 years", "Indefinite"],
      }}
    />
  ),
};

export const Chips: Story = {
  render: () => (
    <Controlled
      field={{
        key: "frameworks",
        label: "Frameworks",
        type: "chips",
        value: ["HIPAA"],
        options: ["HIPAA", "GDPR", "SOC 2", "FedRAMP"],
      }}
    />
  ),
};

export const Text: Story = {
  render: () => (
    <Controlled
      field={{
        key: "webhookUrl",
        label: "Webhook URL",
        type: "text",
        value: "",
      }}
    />
  ),
};
