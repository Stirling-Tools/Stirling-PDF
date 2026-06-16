import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildGettingStartedResponse } from "@portal/mocks/gettingStarted";
import { GoLivePanel } from "@portal/components/getting-started/GoLivePanel";
import "@portal/views/GettingStarted.css";

const pro = buildGettingStartedResponse("pro");
const enterprise = buildGettingStartedResponse("enterprise");

const meta: Meta<typeof GoLivePanel> = {
  title: "Portal/GettingStarted/GoLivePanel",
  component: GoLivePanel,
  parameters: { layout: "padded" },
  args: { sampleKey: pro.sampleKey, snippets: pro.snippets, onDone: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof GoLivePanel>;

export const Default: Story = {};

/** Enterprise snippets carry the custom rate limit in their comments. */
export const Enterprise: Story = {
  args: { sampleKey: enterprise.sampleKey, snippets: enterprise.snippets },
};
