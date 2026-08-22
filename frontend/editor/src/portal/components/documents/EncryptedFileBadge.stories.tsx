import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@app/ui";
import { EncryptedFileBadge } from "@portal/components/documents/EncryptedFileBadge";

const meta: Meta<typeof EncryptedFileBadge> = {
  title: "Portal/Documents/EncryptedFileBadge",
  component: EncryptedFileBadge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof EncryptedFileBadge>;

/** Shown in a file row, which is the only place it makes sense to judge it. */
function FileRow({
  name,
  encryptionKeyId,
}: {
  name: string;
  encryptionKeyId: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.6rem 0",
      }}
    >
      <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{name}</span>
      <EncryptedFileBadge encryptionKeyId={encryptionKeyId} />
    </div>
  );
}

/** Encrypted and plaintext files side by side in a deployment that uses the feature. */
export const InFileList: Story = {
  render: () => (
    <div style={{ maxWidth: "36rem" }}>
      <Card padding="loose">
        <FileRow
          name="Q3-board-pack.pdf"
          encryptionKeyId="1f0b6a11-0000-4000-8000-000000000001"
        />
        <FileRow
          name="signed-msa-acme.pdf"
          encryptionKeyId="1f0b6a11-0000-4000-8000-000000000001"
        />
        <FileRow name="scratch-notes.pdf" encryptionKeyId={null} />
      </Card>
    </div>
  ),
};

/** A deployment that never enabled encryption: no file has a key, so no markers. */
export const FeatureUnused: Story = {
  render: () => (
    <div style={{ maxWidth: "36rem" }}>
      <Card padding="loose">
        <FileRow name="scratch-notes.pdf" encryptionKeyId={null} />
        <FileRow name="draft-terms.pdf" encryptionKeyId={null} />
      </Card>
    </div>
  ),
};
