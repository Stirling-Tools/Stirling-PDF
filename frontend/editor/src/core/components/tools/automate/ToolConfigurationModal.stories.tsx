import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextInput } from "@mantine/core";
import ToolConfigurationModal from "@app/components/tools/automate/ToolConfigurationModal";
import {
  ToolRegistry,
  ToolCategoryId,
  SubcategoryId,
} from "@app/data/toolsTaxonomy";
import {
  ToolAutomationSettingsProps,
  ErasedToolParams,
} from "@app/hooks/tools/shared/toolOperationTypes";

const meta = {
  title: "Tools/Automate/ToolConfigurationModal",
  component: ToolConfigurationModal,
} satisfies Meta<typeof ToolConfigurationModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Registry entry with no automationSettings: the modal falls back to a "no settings" message. */
export const Default: Story = {
  args: {
    opened: true,
    tool: {
      id: "1",
      operation: "autoRename",
      name: "Auto Rename",
    },
    onSave: () => {},
    onCancel: () => {},
    toolRegistry: {},
  },
};

function DemoSettings({
  parameters,
  onParameterChange,
  disabled,
}: ToolAutomationSettingsProps<ErasedToolParams>) {
  return (
    <TextInput
      label="Prefix"
      value={(parameters.prefix as string) ?? ""}
      onChange={(event) =>
        onParameterChange("prefix", event.currentTarget.value)
      }
      disabled={disabled}
    />
  );
}

const registryWithSettings: Partial<ToolRegistry> = {
  autoRename: {
    icon: null,
    name: "Auto Rename",
    component: null,
    description: "Automatically rename files.",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: DemoSettings,
  },
};

/** Registry entry with a settings component: renders the tool's own configuration fields. */
export const WithSettings: Story = {
  args: {
    opened: true,
    tool: {
      id: "1",
      operation: "autoRename",
      name: "Auto Rename",
      parameters: { prefix: "invoice-" },
    },
    onSave: () => {},
    onCancel: () => {},
    toolRegistry: registryWithSettings,
  },
};
