import type { Meta, StoryObj } from "@storybook/react-vite";
import { CsvViewer } from "@app/components/viewer/nonpdf/CsvViewer";

const buildCsvFile = (contents: string, name = "data.csv"): File =>
  new File([contents], name, { type: "text/csv" });

const SAMPLE_CSV = [
  "Name,Age,City",
  "Alice,30,New York",
  "Bob,25,Los Angeles",
  "Charlie,35,Chicago",
].join("\n");

const SAMPLE_TSV = [
  "Name\tAge\tCity",
  "Alice\t30\tNew York",
  "Bob\t25\tLos Angeles",
].join("\n");

const meta = {
  title: "Viewer/NonPdf/CsvViewer",
  component: CsvViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CsvViewer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: buildCsvFile(SAMPLE_CSV),
    isTsv: false,
  },
};

export const Tsv: Story = {
  args: {
    file: buildCsvFile(SAMPLE_TSV, "data.tsv"),
    isTsv: true,
  },
};

export const Empty: Story = {
  args: {
    file: buildCsvFile(""),
    isTsv: false,
  },
};
