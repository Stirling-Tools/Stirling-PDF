import type { Meta, StoryObj } from "@storybook/react-vite";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { CardRail } from "@app/ui/CardRail";
import { OptionCard } from "@app/ui/OptionCard";

const items = [
  {
    icon: <ShieldOutlinedIcon />,
    title: "Security",
    desc: "Redact, sanitize, and watermark every document.",
  },
  {
    icon: <CategoryOutlinedIcon />,
    title: "Classification",
    desc: "Tag each document against your team's labels.",
  },
  {
    icon: <GavelOutlinedIcon />,
    title: "Compliance",
    desc: "Enforce frameworks and keep an audit trail.",
  },
  {
    icon: <LayersOutlinedIcon />,
    title: "Ingestion",
    desc: "OCR and flatten documents as they arrive.",
  },
  {
    icon: <AltRouteOutlinedIcon />,
    title: "Routing",
    desc: "Send finished documents where they belong.",
  },
  {
    icon: <ScheduleOutlinedIcon />,
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
