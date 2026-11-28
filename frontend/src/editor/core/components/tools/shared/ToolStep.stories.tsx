import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import { expect, within } from "storybook/test";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import {
  createFilesToolStep,
  type FilesToolStepProps,
} from "@editor/components/tools/shared/FilesToolStep";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import {
  clearRecentFiles,
  storyFile,
  withFileSources,
} from "@editor/components/shared/fileSourcesStoryProviders";

const meta = {
  title: "Tools/Shared/ToolStep",
  component: ToolStep,
} satisfies Meta<typeof ToolStep>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Select pages",
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

export const WithHelpTextAndNumber: Story = {
  args: {
    title: "Choose output format",
    helpText: "Pick the format your converted file should use.",
    showNumber: true,
    _stepNumber: 2,
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

export const Collapsed: Story = {
  args: {
    title: "Advanced settings",
    isCollapsed: true,
    onCollapsedClick: () => {},
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

const headerAction = (
  <ActionIcon variant="tertiary" size="sm" shape="circle" aria-label="Add">
    <Icon name="plus" size="1.1rem" />
  </ActionIcon>
);

/** A control beside the chevron, shown only while the step is open. */
export const WithHeaderAction: Story = {
  args: {
    title: "Pages",
    headerAction,
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

/** The same step collapsed: the header control hides with the content. */
export const WithHeaderActionCollapsed: Story = {
  args: {
    ...WithHeaderAction.args,
    isCollapsed: true,
    onCollapsedClick: () => {},
  },
};

/** Builds the step the way every tool does, so these follow its rules. */
function FilesStep(props: FilesToolStepProps) {
  return createFilesToolStep(
    (title, stepProps, children) => (
      <ToolStep title={title} {...stepProps}>
        {children}
      </ToolStep>
    ),
    props,
  );
}

/** The Files step before the tool has a file: sources inline, no "+". */
export const FilesStepEmpty: Story = {
  decorators: [withFileSources],
  beforeEach: clearRecentFiles,
  args: { title: "Files" },
  render: () => <FilesStep selectedFiles={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Computer" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add files" }),
    ).not.toBeInTheDocument();
  },
};

/** Once the tool has its file the step is one line, with "+" to add more. */
export const FilesStepWithFile: Story = {
  decorators: [withFileSources],
  beforeEach: clearRecentFiles,
  args: { title: "Files" },
  render: () => (
    <FilesStep selectedFiles={[storyFile("quarterly-report.pdf")]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTitle("quarterly-report.pdf")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add files" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Computer" }),
    ).not.toBeInTheDocument();
  },
};
