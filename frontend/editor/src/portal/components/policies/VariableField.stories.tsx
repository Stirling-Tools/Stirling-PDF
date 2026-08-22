import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariableField } from "@portal/components/policies/VariableField";
import { variableGroupsFor } from "@portal/components/policies/variables";

const meta: Meta<typeof VariableField> = {
  title: "Portal/Policies/VariableField",
  component: VariableField,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof VariableField>;

/** The field is controlled; local state lets the stories be typed into. */
function Controlled({
  initial,
  multiline = true,
  ...rest
}: {
  initial: string;
  multiline?: boolean;
} & Partial<React.ComponentProps<typeof VariableField>>) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ maxWidth: "34rem", display: "grid", gap: "0.75rem" }}>
      <VariableField
        {...rest}
        value={value}
        onChange={setValue}
        multiline={multiline}
        aria-label="Message"
      />
      <code
        style={{
          fontSize: "0.71875rem",
          color: "var(--c-text-muted)",
          wordBreak: "break-all",
        }}
      >
        {value || "(empty)"}
      </code>
    </div>
  );
}

/** The everyday case: a message with three variables already in it. */
export const Message: Story = {
  render: () => (
    <Controlled initial="Filed {{document.filename}} under {{run.policyName}}. Link: {{steps.1.body}}" />
  ),
};

export const Empty: Story = {
  render: () => <Controlled initial="" placeholder="Write your message" />,
};

/** A short field: no toolbar, the add button rides inside the input. */
export const SingleLine: Story = {
  render: () => (
    <Controlled
      initial="#finance-{{classification.label}}"
      multiline={false}
      placeholder="#channel"
    />
  ),
};

/**
 * Step 3 of a chain, so the list offers step 1 and step 2 - and each box says which step it
 * depends on.
 */
export const CrossStep: Story = {
  render: () => (
    <Controlled
      initial="{{steps.1.body}} then {{steps.2.status}}"
      groups={variableGroupsFor(undefined, 3)}
    />
  ),
};

/**
 * A vendor path the catalogue has no name for. It stays valid and swappable, but is drawn as the
 * raw path so nobody mistakes it for a variable we can describe.
 */
export const UnnamedPath: Story = {
  render: () => (
    <Controlled initial="Share link: {{steps.1.body.ocs.data.url}}" />
  ),
};

/** Step 1 has no earlier steps, and a team without Purview loses that scope entirely. */
export const NarrowedScopes: Story = {
  render: () => (
    <Controlled
      initial="{{document.filename}}"
      groups={variableGroupsFor(
        { classification: true, sensitivityLabel: false },
        1,
      )}
    />
  ),
};
