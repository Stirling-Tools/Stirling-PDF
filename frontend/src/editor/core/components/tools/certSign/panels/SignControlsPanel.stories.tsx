import type { Meta, StoryObj } from "@storybook/react-vite";
import SignControlsPanel from "@app/components/tools/certSign/panels/SignControlsPanel";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";

const meta = {
  title: "CertSign/SignControlsPanel",
  component: SignControlsPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SignControlsPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

const textSignatureConfig: SignParameters = {
  signatureType: "text",
  signerName: "Alice Anderson",
  fontFamily: "Helvetica",
  fontSize: 16,
  textColor: "#000000",
  signatureData: "Alice Anderson",
};

export const Default: Story = {
  args: {
    placementMode: false,
    onPlacementModeChange: () => {},
    onSignatureSelected: () => {},
    onComplete: () => {},
    canComplete: true,
    signatureConfig: textSignatureConfig,
    hasSelectedAnnotation: true,
    onDeleteSelected: () => {},
  },
};

export const PlacingNoSelection: Story = {
  args: {
    ...Default.args,
    placementMode: true,
    canComplete: false,
    hasSelectedAnnotation: false,
  },
};

export const NoSignatureChosen: Story = {
  args: {
    ...Default.args,
    signatureConfig: { signatureType: "canvas" },
    hasSelectedAnnotation: false,
  },
};
