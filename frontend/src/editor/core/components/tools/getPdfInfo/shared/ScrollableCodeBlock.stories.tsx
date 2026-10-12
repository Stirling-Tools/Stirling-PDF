import type { Meta, StoryObj } from "@storybook/react-vite";
import ScrollableCodeBlock from "@app/components/tools/getPdfInfo/shared/ScrollableCodeBlock";

const meta = {
  title: "Tools/GetPdfInfo/Shared/ScrollableCodeBlock",
  component: ScrollableCodeBlock,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScrollableCodeBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Sample Document</dc:title>
      <dc:creator>Stirling PDF</dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`,
  },
};

export const Empty: Story = {
  args: {
    content: null,
  },
};

export const CustomEmptyMessage: Story = {
  args: {
    content: undefined,
    emptyMessage: "No structure tree found in this document",
  },
};
