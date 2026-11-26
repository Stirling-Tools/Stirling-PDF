import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureImagePicker } from "@editor/components/shared/signatureFields/SignatureImagePicker";

// icon-lint-allow: storybook-fixture -- Fake signature images for the picker stories.
const scrawl = (path: string) =>
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><path d="${path}" stroke="black" fill="none" stroke-width="3" stroke-linecap="round"/></svg>`,
  );

const SAVED = [
  {
    id: "drawn",
    label: "Drawn signature",
    dataUrl: scrawl(
      "M10 60 C 40 10 60 10 70 50 S 110 70 130 40 S 170 20 190 50 L 230 40",
    ),
  },
  {
    id: "initials",
    label: "Initials",
    dataUrl: scrawl("M20 60 L 50 15 L 80 60 M 110 15 L 110 60 L 150 60"),
  },
];

const Demo = ({ saved }: { saved: typeof SAVED }) => {
  const [file, setFile] = useState<File | undefined>();
  return (
    <div style={{ width: 320 }}>
      <SignatureImagePicker
        saved={saved}
        value={file}
        onChange={setFile}
        onAdd={() => {}}
      />
    </div>
  );
};

const meta = {
  title: "Shared/SignatureFields/SignatureImagePicker",
  component: Demo,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSavedSignatures: Story = { args: { saved: SAVED } };

export const NothingSaved: Story = { args: { saved: [] } };
