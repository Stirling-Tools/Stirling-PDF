import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureFieldList } from "@editor/components/shared/signatureFields/SignatureFieldList";
import type { EmptySignatureField } from "@editor/services/signatureFieldLayout";

const box = { x: 72, y: 178, width: 188, height: 58 };
const field = (name: string, pageIndex: number): EmptySignatureField => ({
  name,
  pageIndex,
  box,
});

const twoFields = [
  field("Company signature", 0),
  field("Supplier signature", 0),
];

const manyFields = [
  field(
    "Authorised signatory for and on behalf of Example Holdings Limited (company number 01234567)",
    0,
  ),
  field("Treasurer", 0),
  field("CompanySecretarySignatureFieldWithoutAnySpacesAtAll_v2", 0),
  field("Director A", 0),
  field("Director B", 1),
  field("Director C", 1),
  field(
    "Witness to the signature of the Chair, full name and address required",
    1,
  ),
  field("Witness 2", 1),
];

const meta = {
  title: "Shared/SignatureFields/SignatureFieldList",
  component: SignatureFieldList,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Where to sign",
    fields: twoFields,
    selected: "Company signature",
    onChange: () => {},
  },
} satisfies Meta<typeof SignatureFieldList>;
export default meta;
type Story = StoryObj<typeof meta>;

function ListDemo(props: React.ComponentProps<typeof SignatureFieldList>) {
  const [selected, setSelected] = useState(props.selected);
  return (
    <SignatureFieldList {...props} selected={selected} onChange={setSelected} />
  );
}

export const TwoFields: Story = {
  render: (args) => <ListDemo {...args} allowCustomPosition />,
};

export const ManyFieldsWithLongNames: Story = {
  args: { fields: manyFields, selected: manyFields[0].name },
  render: (args) => <ListDemo {...args} allowCustomPosition />,
};

export const CustomPositionChosen: Story = {
  args: { selected: null },
  render: (args) => <ListDemo {...args} allowCustomPosition />,
};

export const FieldsOnly: Story = {
  render: (args) => <ListDemo {...args} />,
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <ListDemo {...args} allowCustomPosition />,
};
