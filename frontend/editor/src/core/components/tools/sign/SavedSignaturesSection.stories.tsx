import type { Meta, StoryObj } from "@storybook/react-vite";
import SavedSignaturesSection from "@app/components/tools/sign/SavedSignaturesSection";
import type { SavedSignature } from "@app/hooks/tools/sign/useSavedSignatures";

const mockSignatures: SavedSignature[] = [
  {
    id: "sig-1",
    label: "My signature",
    scope: "personal",
    type: "text",
    dataUrl: "",
    signerName: "Jordan Lee",
    fontFamily: "cursive",
    fontSize: 32,
    textColor: "#1a1a1a",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "sig-2",
    label: "Company stamp",
    scope: "shared",
    type: "image",
    dataUrl:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="white"/><text x="10" y="45" font-size="20">Approved</text></svg>',
      ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "sig-3",
    label: "Quick draw",
    scope: "localStorage",
    type: "canvas",
    dataUrl:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="white"/><path d="M10 60 Q 50 10 100 60 T 190 60" stroke="black" fill="none" stroke-width="3"/></svg>',
      ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const meta = {
  title: "Tools/Sign/SavedSignaturesSection",
  component: SavedSignaturesSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SavedSignaturesSection>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    signatures: mockSignatures,
    isAtCapacity: false,
    maxLimit: 5,
    onUseSignature: () => {},
    onDeleteSignature: () => {},
    onRenameSignature: () => {},
  },
};

export const Empty: Story = {
  args: {
    signatures: [],
    isAtCapacity: false,
    maxLimit: 5,
    onUseSignature: () => {},
    onDeleteSignature: () => {},
    onRenameSignature: () => {},
  },
};

export const AtCapacity: Story = {
  args: {
    signatures: mockSignatures,
    isAtCapacity: true,
    maxLimit: 3,
    onUseSignature: () => {},
    onDeleteSignature: () => {},
    onRenameSignature: () => {},
  },
};

export const AdminWithSharedDelete: Story = {
  args: {
    signatures: mockSignatures,
    isAtCapacity: false,
    maxLimit: 5,
    isAdmin: true,
    onUseSignature: () => {},
    onDeleteSignature: () => {},
    onRenameSignature: () => {},
  },
};
