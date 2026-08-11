import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { ConnectAccountRail } from "@portal/components/ConnectAccountRail";

/**
 * The rail only exists where the instance CAN link but has not, and both halves of that come from
 * outside the component: the capability from the backend app-config, the link state from context.
 * The global mock answers app-config without the flag, so every other portal story stays ungated
 * and a story that wants to see the rail has to ask.
 */
const canLink = {
  msw: {
    handlers: [
      http.get("/api/v1/config/app-config", () =>
        HttpResponse.json({ accountLinkAvailable: true }),
      ),
    ],
  },
};

const withLinkState = (state: LinkState) => [
  (Story: () => React.JSX.Element) => (
    <LinkProvider initialState={state}>
      <Story />
    </LinkProvider>
  ),
];

const meta: Meta<typeof ConnectAccountRail> = {
  title: "Portal/AccountLink/ConnectAccountRail",
  component: ConnectAccountRail,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ConnectAccountRail>;

/** How it appears on Home: the ask, plus a way to defer it for this session. */
export const Default: Story = {
  parameters: canLink,
  decorators: withLinkState("unlinked"),
};

/**
 * Connected, so the rail removes itself. Renders nothing on purpose — the ask has been answered
 * and a permanent banner would be noise.
 */
export const Hidden: Story = {
  parameters: canLink,
  decorators: withLinkState("linked-free"),
};
