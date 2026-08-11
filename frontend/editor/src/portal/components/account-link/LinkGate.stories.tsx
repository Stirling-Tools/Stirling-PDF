import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { LinkGate } from "@portal/components/account-link/LinkGate";

const Feature = () => (
  <p>The feature itself, rendered once the account is connected.</p>
);

/**
 * A fresh query client per story. The preview shares one across all stories, so the app-config
 * answer from whichever story ran first would otherwise be served from cache here and these four
 * would stop showing what they claim to.
 */
function Isolated({
  state,
  children,
}: {
  state: LinkState;
  children: ReactNode;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <LinkProvider initialState={state}>{children}</LinkProvider>
    </QueryClientProvider>
  );
}

const setup = (accountLinkAvailable: boolean, state: LinkState) => ({
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/config/app-config", () =>
          HttpResponse.json({ accountLinkAvailable }),
        ),
      ],
    },
  },
  decorators: [
    (Story: () => React.JSX.Element) => (
      <Isolated state={state}>
        <Story />
      </Isolated>
    ),
  ],
});

const meta: Meta<typeof LinkGate> = {
  title: "Portal/AccountLink/LinkGate",
  component: LinkGate,
  parameters: { layout: "padded" },
  args: { feature: "Pipelines", children: <Feature /> },
};
export default meta;
type Story = StoryObj<typeof LinkGate>;

/**
 * The gate. It replaces the feature rather than sitting beside it, which is what makes it convert:
 * an admin who clicked "New pipeline" has already declared intent.
 *
 * No credit claim here. On the modal the free grant is an inducement; on a gate it reads as a price
 * of entry, and it is not ours to promise anyway.
 */
export const Gated: Story = setup(true, "unlinked");

/** Bare, for a caller that already supplies its own card. */
export const GatedBare: Story = {
  ...setup(true, "unlinked"),
  args: { bare: true },
};

/** Connected, so the feature renders untouched. */
export const Linked: Story = setup(true, "linked-free");

/**
 * Linking unavailable on this instance, which is the default everywhere the feature flag is off.
 * The feature must still render: gating a server that CANNOT link would lock it with no way out.
 */
export const LinkingUnavailable: Story = setup(false, "unlinked");
