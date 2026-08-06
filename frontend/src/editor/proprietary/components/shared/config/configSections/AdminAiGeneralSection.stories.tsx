import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import AdminAiGeneralSection from "@editor/components/shared/config/configSections/AdminAiGeneralSection";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { UnsavedChangesProvider } from "@editor/contexts/UnsavedChangesContext";
import type { AiEngineApiResponse } from "@editor/components/shared/config/configSections/aiEngineSettings";

// AdminAiGeneralSection fetches the shared aiEngine settings blob on mount via
// apiClient (no service seam to stub), so each variant supplies its own MSW
// handler for GET .../admin/settings/section/aiEngine. Saves PUT back to the
// same section plus the generic /admin/settings delta endpoint; the smoke
// test never clicks Save, so those aren't stubbed here.
const baseSettings: AiEngineApiResponse = {
  enabled: true,
  url: "http://stirling-pdf-engine:5001",
  timeoutSeconds: 30,
  longRunningTimeoutSeconds: 120,
  streamTimeoutSeconds: 60,
  features: {
    chat: true,
    documentQuestions: true,
    createPdf: false,
    mathAuditor: false,
    pdfComment: false,
    classify: true,
  },
};

const handlerFor = (data: AiEngineApiResponse) =>
  http.get("*/api/v1/admin/settings/section/aiEngine", () =>
    HttpResponse.json(data),
  );

const meta = {
  title: "Config/AdminAiGeneralSection",
  component: AdminAiGeneralSection,
  parameters: {
    layout: "padded",
    msw: { handlers: [handlerFor(baseSettings)] },
  },
  // useSettingsDirty() reads UnsavedChangesContext and the section reads login
  // state via useAppConfig(), neither of which the global preview supplies.
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
} satisfies Meta<typeof AdminAiGeneralSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** AI enabled, connected to an engine, with a mix of capabilities toggled on. */
export const Default: Story = {};

/** Master switch off: the URL, timeouts, and capability switches are all disabled. */
export const Disabled: Story = {
  parameters: {
    msw: { handlers: [handlerFor({ ...baseSettings, enabled: false })] },
  },
};

/** The engine URL was changed and saved but awaits a restart to take effect. */
export const PendingRestart: Story = {
  parameters: {
    msw: {
      handlers: [
        handlerFor({
          ...baseSettings,
          _pending: { url: "http://stirling-pdf-engine:6001" },
        }),
      ],
    },
  },
};
