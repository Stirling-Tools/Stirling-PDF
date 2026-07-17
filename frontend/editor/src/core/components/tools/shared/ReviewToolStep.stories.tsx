import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import {
  createReviewToolStep,
  ReviewToolStepProps,
} from "@app/components/tools/shared/ReviewToolStep";
import ToolStep from "@app/components/tools/shared/ToolStep";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import { AppProviders } from "@app/components/AppProviders";

function makeFile(name: string, type = "application/pdf"): File {
  return new File(["%PDF-1.4 storybook fixture"], name, { type });
}

function makeOperation(
  overrides: Partial<ToolOperationHook<unknown>> = {},
): ToolOperationHook<unknown> {
  return {
    files: [],
    thumbnails: [],
    isGeneratingThumbnails: false,
    downloadUrl: null,
    downloadFilename: "",
    downloadLocalPath: null,
    outputFileIds: null,
    isLoading: false,
    status: "idle",
    errorMessage: null,
    progress: null,
    willUseCloud: false,
    executeOperation: async () => {},
    resetResults: () => {},
    clearError: () => {},
    cancelOperation: () => {},
    undoOperation: async () => {},
    ...overrides,
  };
}

// ReviewToolStep.tsx has no plain component export — createReviewToolStep is a
// factory that plugs into the step-wizard's `create` callback (see ToolStep's
// createToolSteps). ToolStep is that same callback shape the real wizard uses,
// so wire it up the same way to mount the actual review content.
function ReviewToolStepPreview(props: ReviewToolStepProps) {
  return createReviewToolStep(
    (title, stepProps, children) => (
      <ToolStep title={title} {...stepProps}>
        {children}
      </ToolStep>
    ),
    props,
  );
}

// ReviewStepContent reads/writes files via FileContext and renders
// SuggestedToolsSection, which reads from NavigationContext + ToolWorkflowContext —
// mount the real provider tree rather than stubbing each one individually.
function withProviders(Story: () => ReactElement) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <Story />
    </AppProviders>
  );
}

const meta = {
  title: "Tools/Shared/ReviewToolStep",
  component: ReviewToolStepPreview,
  decorators: [withProviders],
} satisfies Meta<typeof ReviewToolStepPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isVisible: true,
    operation: makeOperation({
      files: [makeFile("merged-output.pdf")],
      downloadUrl: "blob:storybook-fake-url",
      downloadFilename: "merged-output.pdf",
    }),
    onUndo: () => {},
  },
};

export const WithError: Story = {
  args: {
    isVisible: true,
    operation: makeOperation({
      errorMessage: "Something went wrong while processing the file.",
    }),
  },
};

export const Collapsed: Story = {
  args: {
    ...Default.args,
    isCollapsed: true,
    onCollapsedClick: () => {},
  },
};
