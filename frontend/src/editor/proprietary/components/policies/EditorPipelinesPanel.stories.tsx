import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  EditorPipelinesPanelView,
  type EditorPipelinesPanelViewProps,
} from "@app/components/policies/EditorPipelinesPanel";
import type { EditorPipeline } from "@app/components/policies/useEditorPipelines";

const pipeline = (over: Partial<EditorPipeline>): EditorPipeline => ({
  policyKey: "classification",
  label: "Classification",
  runOn: "upload",
  running: false,
  failed: false,
  runsToday: 0,
  ...over,
});

const meta: Meta<typeof EditorPipelinesPanelView> = {
  title: "Policies/EditorPipelinesPanel",
  component: EditorPipelinesPanelView,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: "18.5rem", background: "var(--c-surface)" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EditorPipelinesPanelView>;

const withDefaults = (
  props: Partial<EditorPipelinesPanelViewProps>,
): EditorPipelinesPanelViewProps => {
  const onImport = props.onImport ?? [];
  const onExport = props.onExport ?? [];
  return {
    onImport,
    onExport,
    total: onImport.length + onExport.length,
    onOpenProcessor: () => {},
    ...props,
  };
};

export const Default: Story = {
  args: withDefaults({
    onImport: [
      pipeline({ runsToday: 12 }),
      pipeline({ policyKey: "ingestion", label: "Ingestion", runsToday: 12 }),
    ],
    onExport: [
      pipeline({
        policyKey: "security",
        label: "Security",
        runOn: "export",
        runsToday: 3,
      }),
    ],
  }),
};

export const Running: Story = {
  args: withDefaults({
    onImport: [pipeline({ running: true, runsToday: 4 })],
    onExport: [
      pipeline({
        policyKey: "security",
        label: "Security",
        runOn: "export",
        runsToday: 1,
      }),
    ],
  }),
};

export const LastRunFailed: Story = {
  args: withDefaults({
    onImport: [pipeline({ failed: true, runsToday: 6 })],
  }),
};

export const Empty: Story = { args: withDefaults({}) };

export const WithoutPortalAccess: Story = {
  args: withDefaults({
    onImport: [pipeline({ runsToday: 12 })],
    onOpenProcessor: null,
  }),
};
