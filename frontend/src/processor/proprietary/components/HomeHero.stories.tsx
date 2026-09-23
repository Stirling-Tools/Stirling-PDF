import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeHero } from "@portal/components/HomeHero";

const meta = {
  title: "Portal/Home/HomeHero",
  component: HomeHero,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeHero>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The hero is the Editor deployment rail on every tier and in both editions — it reports its own
 * deployment state and deploy ask, so there is nothing tier-specific left to compose. A live
 * procurement deal attaches the deal-status hero as the rail's footer; that comes from
 * useProcurement, so it follows the mocked backend rather than a story arg.
 */
export const Default: Story = {};
