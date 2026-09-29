import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import type { FileState } from "@app/types/file";

const mockFile: FileState = {
  name: "contract.pdf",
  size: 245_760,
};

function CreateSessionFlowDemo({
  initialFiles,
}: {
  initialFiles: FileState[];
}) {
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");

  return (
    <CreateSessionFlow
      selectedFiles={initialFiles}
      selectedUserIds={selectedUserIds}
      onSelectedUserIdsChange={setSelectedUserIds}
      dueDate={dueDate}
      onDueDateChange={setDueDate}
      creating={false}
      onSubmit={() => {}}
    />
  );
}

const meta = {
  title: "Shared/Signing/CreateSessionFlow",
  component: CreateSessionFlow,
  parameters: { layout: "padded" },
  args: {
    selectedFiles: [mockFile],
    selectedUserIds: [],
    onSelectedUserIdsChange: () => {},
    dueDate: "",
    onDueDateChange: () => {},
    creating: false,
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateSessionFlow>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A single file is selected, so step 1 shows its picker instead of the "no file" message. */
export const Default: Story = {
  render: () => <CreateSessionFlowDemo initialFiles={[mockFile]} />,
};

/** No file selected yet: step 1 shows the empty-state prompt instead of the document picker. */
export const NoFileSelected: Story = {
  render: () => <CreateSessionFlowDemo initialFiles={[]} />,
};

/** Session creation in flight: the review step's submit action is disabled. */
export const Creating: Story = {
  args: {
    selectedFiles: [mockFile],
    selectedUserIds: [1, 2],
    onSelectedUserIdsChange: () => {},
    dueDate: "2026-08-01",
    onDueDateChange: () => {},
    creating: true,
    onSubmit: () => {},
  },
};
