import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyComplianceCheckConfig } from "@portal/components/policies/PolicyComplianceCheckConfig";
import {
  complianceCheckDefaultParameters,
  type ComplianceCheckParameters,
} from "@app/policies/operations";

const meta: Meta<typeof PolicyComplianceCheckConfig> = {
  title: "Portal/Policies/PolicyComplianceCheckConfig",
  component: PolicyComplianceCheckConfig,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyComplianceCheckConfig>;

/** Renders the config and keeps its parameters in local state, exercising onChange. */
function Controlled({ parameters }: { parameters: ComplianceCheckParameters }) {
  const [value, setValue] = useState(parameters);
  return <PolicyComplianceCheckConfig parameters={value} onChange={setValue} />;
}

/** The fail-closed preset: PDF/A, and a document that misses it stops the run. */
export const Default: Story = {
  render: () => <Controlled parameters={complianceCheckDefaultParameters} />,
};

/** Accessibility instead of archiving, recording misses rather than blocking them. */
export const AccessibilityWarnOnly: Story = {
  render: () => (
    <Controlled parameters={{ standard: "pdfua", onViolation: "warn" }} />
  ),
};
