import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import AdminAiModelsSection from "@editor/components/shared/config/configSections/AdminAiModelsSection";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@editor/contexts/UnsavedChangesContext";
import {
  AiEngineApiResponse,
  MASKED_SECRET,
} from "@editor/components/shared/config/configSections/aiEngineSettings";

/**
 * AdminAiModelsSection fetches its settings via apiClient on mount (through
 * useAdminSettings) rather than taking props, so each story mocks the GET
 * with MSW. It also reads useAppConfig()/useSettingsDirty(), which throw
 * without their providers, so every story wraps in both.
 */
function withProviders(Story: () => React.JSX.Element) {
  return (
    <AppConfigProvider autoFetch={false} initialConfig={{ enableLogin: true }}>
      <UnsavedChangesProvider>
        <Story />
      </UnsavedChangesProvider>
    </AppConfigProvider>
  );
}

function aiEngineHandler(response: AiEngineApiResponse) {
  return http.get("/api/v1/admin/settings/section/aiEngine", () =>
    HttpResponse.json(response),
  );
}

const meta = {
  title: "Config/AdminAiModelsSection",
  component: AdminAiModelsSection,
  parameters: { layout: "padded" },
  decorators: [withProviders],
} satisfies Meta<typeof AdminAiModelsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Anthropic provider with a saved (masked) API key and no base URL field. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        aiEngineHandler({
          models: {
            provider: "anthropic",
            smartModel: "claude-sonnet-5",
            fastModel: "claude-haiku-4-5",
            smartMaxTokens: 8192,
            fastMaxTokens: 2048,
            apiKey: MASKED_SECRET,
          },
        }),
      ],
    },
  },
};

/** Ollama provider: no API key field, but a base URL input and an SSRF warning banner instead. */
export const OllamaProvider: Story = {
  parameters: {
    msw: {
      handlers: [
        aiEngineHandler({
          models: {
            provider: "ollama",
            smartModel: "llama3.1",
            fastModel: "qwen2.5",
            smartMaxTokens: 4096,
            fastMaxTokens: 1024,
            baseUrl: "http://ollama:11434/v1",
          },
        }),
      ],
    },
  },
};

/** Some fields are pending a config-management rollout — each shows a PendingBadge next to its label. */
export const PendingChanges: Story = {
  parameters: {
    msw: {
      handlers: [
        aiEngineHandler({
          models: {
            provider: "anthropic",
            smartModel: "claude-sonnet-5",
            fastModel: "claude-haiku-4-5",
            smartMaxTokens: 8192,
            fastMaxTokens: 2048,
            apiKey: MASKED_SECRET,
          },
          _pending: {
            models: {
              smartModel: "claude-opus-4-8",
            },
          },
        }),
      ],
    },
  },
};
