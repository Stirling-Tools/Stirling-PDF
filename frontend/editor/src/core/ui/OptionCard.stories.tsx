import type { Meta, StoryObj } from "@storybook/react-vite";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { OptionCard } from "@app/ui/OptionCard";

const setUp = (
  <>
    Set up
    <ArrowForwardRoundedIcon style={{ fontSize: "1rem" }} />
  </>
);

const comingSoon = (
  <>
    <LockOutlinedIcon style={{ fontSize: "0.95rem" }} />
    Coming soon
  </>
);

const meta: Meta<typeof OptionCard> = {
  title: "Primitives/OptionCard",
  component: OptionCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    icon: <ShieldOutlinedIcon />,
    title: "Security",
    description:
      "Redact sensitive information, strip active content, and watermark every document.",
    cta: setUp,
    disabled: false,
    onSelect: () => {},
  },
  argTypes: {
    icon: { control: false },
    cta: { control: false },
    note: { control: false },
    onSelect: { control: false },
    descriptionLines: { control: { type: "number", min: 1, max: 6 } },
  },
  decorators: [
    (S) => (
      <div style={{ width: "16rem", height: "12rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof OptionCard>;

/** Toggle `disabled`, edit the title/description, change the clamp in controls. */
export const Playground: Story = {};

/** Inert: no click or hover, muted, with a note in place of the CTA. */
export const Disabled: Story = {
  args: { disabled: true, note: comingSoon },
};

/** The gallery use case: a row of selectable options with one disabled. */
export const Gallery: Story = {
  decorators: [
    (S) => (
      <div style={{ width: "100%" }}>
        <S />
      </div>
    ),
  ],
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", height: "12rem" }}>
      <div style={{ flex: "0 0 16rem" }}>
        <OptionCard
          icon={<ShieldOutlinedIcon />}
          title="Security"
          description="Redact sensitive information, strip active content, and watermark every document."
          cta={setUp}
          onSelect={() => {}}
        />
      </div>
      <div style={{ flex: "0 0 16rem" }}>
        <OptionCard
          icon={<CategoryOutlinedIcon />}
          title="Classification"
          description="Identify each document's type against your team's labels and tag it automatically."
          cta={setUp}
          onSelect={() => {}}
        />
      </div>
      <div style={{ flex: "0 0 16rem" }}>
        <OptionCard
          icon={<GavelOutlinedIcon />}
          title="Compliance"
          description="Enforce your regulatory frameworks and keep an audit trail of every change."
          disabled
          note={comingSoon}
        />
      </div>
    </div>
  ),
};
