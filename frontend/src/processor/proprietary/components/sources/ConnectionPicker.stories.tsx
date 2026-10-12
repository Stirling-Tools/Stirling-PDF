import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";

const meta: Meta<typeof ConnectionPicker> = {
  title: "Portal/Sources/ConnectionPicker",
  component: ConnectionPicker,
  parameters: { layout: "padded" },
  args: {
    value: "",
    onChange: () => {},
    integrationType: "S3",
    createTypeId: "s3",
  },
};
export default meta;
type Story = StoryObj<typeof ConnectionPicker>;

/** Filtered to S3 connections; the global mock data has one bucket to pick. */
export const Default: Story = {};

/** A preset-scoped slot (e.g. a Jira step): only Jira connections and the free-form
 * custom API connection are offered, since the latter can point anywhere. */
export const PresetScoped: Story = {
  args: {
    integrationType: "API",
    createTypeId: "api",
    presetId: "jira",
  },
};

/** Embedded inside a host modal (e.g. the source builder), which offers its own
 * create surface instead of stacking the shared connection modal on top. */
export const DelegatedCreate: Story = {
  args: {
    onCreateNew: () => {},
  },
};

/** The connections list fails to load; the picker still renders empty with an
 * inline error banner rather than blocking the field. */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", () =>
          HttpResponse.json(
            { detail: "Could not reach the backend" },
            { status: 500 },
          ),
        ),
      ],
    },
  },
};
