import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import { PipelineStepSettings } from "@portal/components/pipelines/PipelineStepSettings";

/** Stand-in for a tool's real automation settings UI. */
function MockCompressSettings({
  parameters,
  onParameterChange,
}: {
  parameters: Record<string, unknown>;
  onParameterChange: (key: string, value: unknown) => void;
}) {
  return (
    <label>
      Compression level
      <input
        type="number"
        value={(parameters.level as number) ?? 5}
        onChange={(e) => onParameterChange("level", Number(e.target.value))}
      />
    </label>
  );
}

const editableStep = {
  support: "editable",
  toolId: "compress",
  params: { level: 5 },
} as unknown as WorkingToolStep;

const noSettingsStep = {
  support: "noSettings",
  toolId: "flatten",
  params: {},
} as unknown as WorkingToolStep;

const unsupportedStep = {
  support: "unsupported",
  toolId: "convert",
  params: {},
} as unknown as WorkingToolStep;

const registry = {
  compress: { automationSettings: MockCompressSettings },
} as unknown as Partial<ToolRegistry>;

const meta = {
  title: "Portal/Pipelines/PipelineStepSettings",
  component: PipelineStepSettings,
  args: {
    step: editableStep,
    registry,
    onChange: () => {},
  },
} satisfies Meta<typeof PipelineStepSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tool with an editable settings UI, rendered via the tool's own component. */
export const Editable: Story = {};

/** A migrated tool with no configurable parameters — shows an informational note. */
export const NoSettings: Story = {
  args: {
    step: noSettingsStep,
  },
};

/** A tool not yet migrated to the automation mapper seam — shows a fallback warning. */
export const Unsupported: Story = {
  args: {
    step: unsupportedStep,
    registry: {},
  },
};
