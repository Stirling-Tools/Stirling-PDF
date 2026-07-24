import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

import { PolicyExternalApiConfig } from "@portal/components/policies/PolicyExternalApiConfig";
import {
  buildStepParameters,
  operationById,
  type ExternalApiStepParams,
} from "@portal/components/policies/stepOperations";

// The component reaches for the shared query layer (variable availability), so
// wrap in the query client + Mantine the portal provides.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => Promise.resolve([]),
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  createIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

// Only what the query layer pulls from the module; importing the real one would
// drag in the full i18n chain the test has already mocked away.
vi.mock("@portal/api/policies", () => ({
  fetchPoliciesList: () => Promise.resolve([]),
  fetchPolicyRuns: () => Promise.resolve([]),
  assemblePolicies: () => ({ summary: {}, catalogue: [] }),
}));

vi.mock("@portal/api/http", () => ({
  errorMessage: (e: unknown) => String(e),
}));

// A stateful host so the controlled component behaves as it does in the builder, and the test can
// read the parameters after each change.
let latest: ExternalApiStepParams;
function Harness({ initial }: { initial: ExternalApiStepParams }) {
  const [params, setParams] = useState(initial);
  latest = params;
  return (
    <PolicyExternalApiConfig
      parameters={params}
      onChange={(p) => {
        latest = p;
        setParams(p);
      }}
    />
  );
}

describe("switching an operation's vendor", () => {
  beforeEach(() => {
    latest = undefined as unknown as ExternalApiStepParams;
  });

  it("drops the account, so a Slack webhook is never carried into a Jira step", async () => {
    const discord = buildStepParameters(operationById("discordNotify")!, "5", {
      message: "hi",
    });
    render(<Harness initial={discord} />);

    // Start on the Discord form with its account chosen.
    expect(latest.operationId).toBe("discordNotify");
    expect(latest.connectionId).toBe("5");

    // Change the operation, then pick a different vendor.
    fireEvent.click(screen.getByText("portal.policies.operations.change"));
    fireEvent.click(
      await screen.findByText("portal.policies.operations.jiraAttach.label"),
    );

    await waitFor(() => expect(latest.operationId).toBe("jiraAttach"));
    // The Discord account did not ride across to the Jira step.
    expect(latest.connectionId).toBe("");
  });
});
