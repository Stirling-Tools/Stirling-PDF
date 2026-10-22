import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";

/**
 * Config section showing the user's API key, with copy/refresh actions and
 * links to the API docs. Fetches the key from the backend on mount, so the
 * different visual states are driven by mocking `get-api-key` via MSW rather
 * than props (the component takes none).
 */
const meta: Meta<typeof ApiKeys> = {
  title: "Config/ConfigSections/ApiKeys",
  component: ApiKeys,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.post("/api/v1/user/get-api-key", () =>
          HttpResponse.json("demo-storybook-api-key-000000000000"),
        ),
      ],
    },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** While the key request is in flight, the card shows a skeleton placeholder. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/v1/user/get-api-key", async () => {
          await delay("infinite");
          return HttpResponse.json(null);
        }),
      ],
    },
  },
};

/** When the key request fails, an error banner with a retry link is shown. */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/v1/user/get-api-key", () =>
          HttpResponse.json(null, { status: 500 }),
        ),
      ],
    },
  },
};
