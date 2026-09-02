import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyPdfaConfig } from "@portal/components/policies/PolicyPdfaConfig";
import {
  pdfaDefaultParameters,
  type PdfaPolicyParameters,
} from "@app/policies/pdfaOperation";

const meta: Meta<typeof PolicyPdfaConfig> = {
  title: "Portal/Policies/PolicyPdfaConfig",
  component: PolicyPdfaConfig,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyPdfaConfig>;

/** Renders the config and keeps its parameters in local state, exercising onChange. */
function Controlled({ parameters }: { parameters: PdfaPolicyParameters }) {
  const [value, setValue] = useState(parameters);
  return <PolicyPdfaConfig parameters={value} onChange={setValue} />;
}

/** The preset a fresh compliance policy seeds: PDF/A-2b, conversion shortfalls allowed. */
export const Default: Story = {
  render: () => <Controlled parameters={pdfaDefaultParameters} />,
};

/** The strictest setup: PDF/A-1b, and a conversion that falls short stops the run. */
export const Strict: Story = {
  render: () => (
    <Controlled parameters={{ outputFormat: "pdfa-1", strict: true }} />
  ),
};
