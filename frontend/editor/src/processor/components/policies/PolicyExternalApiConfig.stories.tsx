import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PolicyExternalApiConfig,
  type ExternalApiParams,
} from "@processor/components/policies/PolicyExternalApiConfig";
import {
  buildStepParameters,
  operationById,
} from "@processor/components/policies/stepOperations";

const meta: Meta<typeof PolicyExternalApiConfig> = {
  title: "Processor/Policies/PolicyExternalApiConfig",
  component: PolicyExternalApiConfig,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyExternalApiConfig>;

const EMPTY_PARAMS: ExternalApiParams = {
  connectionId: "",
  path: "",
  method: "",
  bodyMode: "",
  fileFieldName: "",
  responseMode: "",
  resultUrlPath: "",
  resultUrlHeader: "",
  responseSelect: "",
  requireTrue: "",
  fields: "",
  headers: "",
  bodyTemplate: "",
  includeContext: "",
  includeFile: "",
  operationId: "",
  operationValues: "",
};

/** Keeps the parameters in local state, exercising onChange like the real editor does. */
function Controlled({ initial }: { initial: ExternalApiParams }) {
  const [parameters, setParameters] = useState(initial);
  return (
    <PolicyExternalApiConfig parameters={parameters} onChange={setParameters} />
  );
}

export const OperationPicker: Story = {
  render: () => <Controlled initial={EMPTY_PARAMS} />,
};

const slackNotify = operationById("slackNotify")!;
const slackParams = buildStepParameters(slackNotify, "1", {
  message: "{{run.policyName}} processed {{document.filename}}",
});

export const NotifyConfigured: Story = {
  render: () => <Controlled initial={slackParams} />,
};

const customApiCall = operationById("customApiCall")!;
const customParams = buildStepParameters(customApiCall, "", {});

export const CustomApiEscapeHatch: Story = {
  render: () => <Controlled initial={customParams} />,
};
