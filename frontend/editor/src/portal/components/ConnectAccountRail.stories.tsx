import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { ConnectAccountRail } from "@portal/components/ConnectAccountRail";

/**
 * Both halves of "can link but has not" come from outside the component, and the global mock answers
 * app-config without the flag — so a story that wants the rail has to ask for it.
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

/** On Home: the ask, plus a way to defer it for this session. */
export const Default: Story = {
  parameters: canLink,
  decorators: withLinkState("unlinked"),
};

/** Connected, so the rail removes itself. Renders nothing on purpose. */
export const Hidden: Story = {
  parameters: canLink,
  decorators: withLinkState("linked-free"),
};
