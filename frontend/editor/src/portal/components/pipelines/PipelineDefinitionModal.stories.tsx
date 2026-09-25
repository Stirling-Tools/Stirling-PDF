import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui";
import { PipelineDefinitionModal } from "@portal/components/pipelines/PipelineDefinitionModal";

const meta: Meta<typeof PipelineDefinitionModal> = {
  title: "Portal/Pipelines/PipelineDefinitionModal",
  component: PipelineDefinitionModal,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineDefinitionModal>;

const JSON_BODY = JSON.stringify(
  {
    name: "Claims redaction",
    enabled: true,
    inputs: [{ sourceId: "src-in", trigger: { type: "schedule" } }],
    steps: [
      { operation: "/api/v1/misc/ocr-pdf", parameters: { language: "eng" } },
      { operation: "/api/v1/security/redact", parameters: { terms: 2 } },
    ],
    outputIds: ["src-out"],
  },
  null,
  2,
);

/** Starts closed so the trigger can be exercised; click through to the tabs. */
function Playground({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}>View definition</Button>
      <PipelineDefinitionModal
        open={open}
        onClose={() => setOpen(false)}
        json={JSON_BODY}
      />
    </>
  );
}

/** The definition as it opens from the header: JSON first, cURL a tab away. */
export const Default: Story = { render: () => <Playground initialOpen /> };

/** The trigger it opens from, so the closed state can be exercised too. */
export const FromTrigger: Story = { render: () => <Playground /> };
