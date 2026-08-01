import type { Meta, StoryObj } from "@storybook/react-vite";
import ProviderCard from "@app/components/shared/config/configSections/ProviderCard";
import type { Provider } from "@app/components/shared/config/configSections/providerDefinitions";

const mockProvider: Provider = {
  id: "google",
  name: "Google",
  icon: "key-rounded",
  type: "oauth2",
  scope: "Sign-in authentication",
  documentationUrl: "https://docs.stirlingpdf.com/Configuration/OAuth",
  fields: [
    {
      key: "clientId",
      type: "text",
      label: "Client ID",
      description: "The OAuth2 client ID from Google Cloud Console",
      placeholder: "your-client-id.apps.googleusercontent.com",
    },
    {
      key: "clientSecret",
      type: "password",
      label: "Client Secret",
      description: "The OAuth2 client secret from Google Cloud Console",
    },
    {
      key: "scopes",
      type: "tags",
      label: "Scopes",
      description: "OAuth2 scopes to request",
      defaultValue: ["email", "profile"],
    },
    {
      key: "autoProvision",
      type: "switch",
      label: "Auto Provision Users",
      description: "Automatically create accounts for new sign-ins",
      defaultValue: false,
    },
  ],
};

const meta = {
  title: "Shared/Config/ConfigSections/ProviderCard",
  component: ProviderCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProviderCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    provider: mockProvider,
    isConfigured: false,
  },
};

export const Configured: Story = {
  args: {
    provider: mockProvider,
    isConfigured: true,
    settings: {
      clientId: "example-client-id.apps.googleusercontent.com",
      scopes: ["email", "profile"],
      autoProvision: true,
    },
  },
};

export const ReadOnly: Story = {
  args: {
    provider: mockProvider,
    isConfigured: true,
    readOnly: true,
    settings: {
      clientId: "example-client-id.apps.googleusercontent.com",
      scopes: ["email", "profile"],
    },
  },
};
