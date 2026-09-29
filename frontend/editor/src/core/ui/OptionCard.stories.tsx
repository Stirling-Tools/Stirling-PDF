import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { OptionCard } from "@app/ui/OptionCard";

const setUp = (
  <>
    Set up
    <Icon name="arrow-right" size={"1rem"} />
  </>
);

const comingSoon = (
  <>
    <Icon name="lock" size={"0.95rem"} />
    Coming soon
  </>
);

const meta: Meta<typeof OptionCard> = {
  title: "Primitives/OptionCard",
  component: OptionCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    icon: <Icon name="shield" />,
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
          icon={<Icon name="shield" />}
          title="Security"
          description="Redact sensitive information, strip active content, and watermark every document."
          cta={setUp}
          onSelect={() => {}}
        />
      </div>
      <div style={{ flex: "0 0 16rem" }}>
        <OptionCard
          icon={<Icon name="shapes" />}
          title="Classification"
          description="Identify each document's type against your team's labels and tag it automatically."
          cta={setUp}
          onSelect={() => {}}
        />
      </div>
      <div style={{ flex: "0 0 16rem" }}>
        <OptionCard
          icon={<Icon name="gavel" />}
          title="Compliance"
          description="Enforce your regulatory frameworks and keep an audit trail of every change."
          disabled
          note={comingSoon}
        />
      </div>
    </div>
  ),
};
