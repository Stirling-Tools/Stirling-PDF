import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchIntegrations = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => fetchIntegrations(),
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  createIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

vi.mock("@portal/api/http", () => ({
  errorMessage: (e: unknown) => String(e),
}));

// Three API connections sharing integrationType "API": a Slack webhook, a Jira account, and a
// hand-authored custom API. Only presetId tells them apart.
const CONNECTIONS = [
  {
    id: 1,
    name: "Team Slack",
    integrationType: "API",
    config: { presetId: "slack" },
  },
  {
    id: 2,
    name: "Ops Jira",
    integrationType: "API",
    config: { presetId: "jira" },
  },
  {
    id: 3,
    name: "House API",
    integrationType: "API",
    config: { presetId: "api" },
  },
];

describe("ConnectionPicker vendor filtering", () => {
  beforeEach(() => {
    fetchIntegrations.mockReset();
    fetchIntegrations.mockResolvedValue(CONNECTIONS);
  });

  it("offers only the named vendor's accounts, plus custom API, never another webhook", async () => {
    render(
      <ConnectionPicker
        value=""
        onChange={vi.fn()}
        integrationType="API"
        createTypeId="jira"
        presetId="jira"
      />,
    );

    // Open the Mantine Select so its options render.
    fireEvent.click(
      await screen.findByPlaceholderText(
        "portal.connections.picker.placeholder",
      ),
    );

    // Jira (the vendor asked for) and the free-form custom API (which can point anywhere).
    await waitFor(() =>
      expect(screen.getByText("Ops Jira")).toBeInTheDocument(),
    );
    expect(screen.getByText("House API")).toBeInTheDocument();
    // A Jira step must not offer a Slack webhook as its account.
    expect(screen.queryByText("Team Slack")).toBeNull();
  });

  it("without a presetId falls back to every connection of the backend type", async () => {
    render(
      <ConnectionPicker
        value=""
        onChange={vi.fn()}
        integrationType="API"
        createTypeId="api"
      />,
    );

    fireEvent.click(
      await screen.findByPlaceholderText(
        "portal.connections.picker.placeholder",
      ),
    );

    await waitFor(() =>
      expect(screen.getByText("Team Slack")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ops Jira")).toBeInTheDocument();
    expect(screen.getByText("House API")).toBeInTheDocument();
  });
});
