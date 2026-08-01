import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminAiDocumentsSection from "@app/components/shared/config/configSections/AdminAiDocumentsSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";
import {
  AiEngineApiResponse,
  MASKED_SECRET,
} from "@app/components/shared/config/configSections/aiEngineSettings";

// AdminAiDocumentsSection takes no props: it fetches the shared aiEngine settings
// blob via apiClient on mount and reads login state through useAppConfig(), so
// each variant mocks the GET response and wraps in a fixed AppConfigProvider
// (autoFetch off, so stories never hit the real API). It also tracks dirty state
// through useSettingsDirty()/useUnsavedChanges(), which isn't part of Storybook's
// global provider stack, so that needs wrapping here too or the hook throws.
const baseSettings: AiEngineApiResponse = {
  rag: {
    embeddingProvider: "voyageai",
    embeddingModel: "voyage-4",
    embeddingApiKey: MASKED_SECRET,
    topK: 5,
    maxSearches: 3,
  },
};

const handlerFor = (data: AiEngineApiResponse) =>
  http.get("*/api/v1/admin/settings/section/aiEngine", () =>
    HttpResponse.json(data),
  );

const meta = {
  title: "Config/AdminAiDocumentsSection",
  component: AdminAiDocumentsSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        handlerFor(baseSettings),
        http.put("*/api/v1/admin/settings", () => HttpResponse.json({})),
        http.put("*/api/v1/admin/settings/section/aiEngine", () =>
          HttpResponse.json({}),
        ),
      ],
    },
  },
  decorators: [
    (Story) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: true }}
      >
        <UnsavedChangesProvider>
          <Story />
        </UnsavedChangesProvider>
      </AppConfigProvider>
    ),
  ],
} satisfies Meta<typeof AdminAiDocumentsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** VoyageAI embeddings with a saved (masked) API key and default retrieval settings. */
export const Default: Story = {};

/** Ollama needs a base URL instead of an API key: the key field is hidden. */
export const OllamaProvider: Story = {
  parameters: {
    msw: {
      handlers: [
        handlerFor({
          rag: {
            embeddingProvider: "ollama",
            embeddingModel: "nomic-embed-text",
            embeddingBaseUrl: "http://ollama:11434/v1",
            topK: 5,
            maxSearches: 3,
          },
        }),
      ],
    },
  },
};

/** While the settings request is in flight, a centered loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/admin/settings/section/aiEngine", async () => {
          await delay("infinite");
          return HttpResponse.json(baseSettings);
        }),
      ],
    },
  },
};
