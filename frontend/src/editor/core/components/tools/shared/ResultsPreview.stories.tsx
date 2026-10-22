import type { Meta, StoryObj } from "@storybook/react-vite";
import ResultsPreview, {
  ReviewFile,
} from "@app/components/tools/shared/ResultsPreview";

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

const files: ReviewFile[] = [
  { file: makeFile("contract-final.pdf", "application/pdf", 245_760) },
  { file: makeFile("scan-001.pdf", "application/pdf", 1_048_576) },
  { file: makeFile("invoice-march.pdf", "application/pdf", 51_200) },
];

const meta = {
  title: "Tools/Shared/ResultsPreview",
  component: ResultsPreview,
} satisfies Meta<typeof ResultsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    files,
  },
};

export const SingleFile: Story = {
  args: {
    files: [files[0]],
  },
};

export const Loading: Story = {
  args: {
    files: [],
    isGeneratingThumbnails: true,
  },
};

export const Empty: Story = {
  args: {
    files: [],
  },
};
