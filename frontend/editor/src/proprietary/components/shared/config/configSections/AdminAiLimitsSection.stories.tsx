import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminAiLimitsSection from "@app/components/shared/config/configSections/AdminAiLimitsSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@app/contexts/UnsavedChangesContext";
import type { AiEngineApiResponse } from "@app/components/shared/config/configSections/aiEngineSettings";

// AdminAiLimitsSection takes no props: it fetches the shared aiEngine settings
// blob via apiClient on mount and reads login state through useAppConfig(), so
// each variant mocks the GET response and wraps in a fixed AppConfigProvider
// (autoFetch off, so stories never hit the real API).
const baseSettings: AiEngineApiResponse = {
  limits: {
    maxPages: 50,
    maxCharacters: 200000,
    modelMaxConcurrency: 4,
  },
};

const meta = {
  title: "Config/AdminAiLimitsSection",
  component: AdminAiLimitsSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/aiEngine", () =>
          HttpResponse.json(baseSettings),
        ),
        http.put("/api/v1/admin/settings", () => HttpResponse.json({})),
        http.put("/api/v1/admin/settings/section/aiEngine", () =>
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
} satisfies Meta<typeof AdminAiLimitsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Loaded limits with login enabled, so the sticky footer can appear once edited. */
export const Default: Story = {};

/** While the settings request is in flight, a centered loader replaces the form. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/aiEngine", async () => {
          await delay("infinite");
          return HttpResponse.json(baseSettings);
        }),
      ],
    },
  },
};

/** A pending (restart-required) change on max pages shows the pending badge next to its label. */
export const PendingChange: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/admin/settings/section/aiEngine", () =>
          HttpResponse.json({
            ...baseSettings,
            _pending: { limits: { maxPages: 100 } },
          } satisfies AiEngineApiResponse),
        ),
      ],
    },
  },
};
