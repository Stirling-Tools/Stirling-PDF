import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { CardRail } from "@app/ui/CardRail";
import { OptionCard } from "@app/ui/OptionCard";

const items = [
  {
    icon: <Icon name="shield" />,
    title: "Security",
    desc: "Redact, sanitize, and watermark every document.",
  },
  {
    icon: <Icon name="shapes" />,
    title: "Classification",
    desc: "Tag each document against your team's labels.",
  },
  {
    icon: <Icon name="gavel" />,
    title: "Compliance",
    desc: "Enforce frameworks and keep an audit trail.",
  },
  {
    icon: <Icon name="layers" />,
    title: "Ingestion",
    desc: "OCR and flatten documents as they arrive.",
  },
  {
    icon: <Icon name="git-fork" />,
    title: "Routing",
    desc: "Send finished documents where they belong.",
  },
  {
    icon: <Icon name="clock" />,
    title: "Retention",
    desc: "Archive and expire on your schedule.",
  },
];

const meta: Meta<typeof CardRail> = {
  title: "Primitives/CardRail",
  component: CardRail,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CardRail>;

/** A row of equal-size cards that scrolls sideways when they overflow the container. */
export const Default: Story = {
  render: () => (
    <CardRail itemWidth="16rem" itemHeight="11rem">
      {items.map((it) => (
        <OptionCard
          key={it.title}
          icon={it.icon}
          title={it.title}
          description={it.desc}
          cta="Set up"
          onSelect={() => {}}
        />
      ))}
    </CardRail>
  ),
};
