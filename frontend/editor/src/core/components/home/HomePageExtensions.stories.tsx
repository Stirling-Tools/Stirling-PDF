import type { Meta, StoryObj } from "@storybook/react-vite";
// Import the core stub directly via @core: the @app alias would resolve to the
// proprietary HomePageExtensions, which requires live app/proprietary context.
import { HomePageExtensions } from "@core/components/home/HomePageExtensions";

const meta = {
  title: "Home/HomePageExtensions",
  component: HomePageExtensions,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HomePageExtensions>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The core stub renders nothing; the proprietary build shadows it via @app/*. */
export const Default: Story = {};
