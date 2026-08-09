import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import AdminUsageSection from "@app/components/shared/config/configSections/AdminUsageSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import type { EndpointStatisticsResponse } from "@app/services/usageAnalyticsService";

/**
 * Admin dashboard of endpoint usage: a chart and table of the busiest endpoints,
 * with controls for how many to show and whether to count API calls, UI calls or
 * both.
 *
 * The section takes no props. What it shows is decided by the licence: only an
 * ENTERPRISE licence with login mode on reaches the real statistics endpoint.
 * Anything short of that falls back to a built-in demo dataset, freezes the
 * controls and raises the enterprise banner — a deliberate teaser rather than an
 * empty state, so it is the state most admins actually see. Login and licence
 * both come from useAppConfig(), so each story sets them on the provider, and
 * only the licensed stories need the endpoint mocked at all.
 */
function withConfig(config: { enableLogin: boolean; license?: string }) {
  return function Decorator(Story: () => React.JSX.Element) {
    return (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={config}
      >
        <Story />
      </AppConfigProvider>
    );
  };
}

const STATISTICS: EndpointStatisticsResponse = {
  totalVisits: 4820,
  totalEndpoints: 6,
  endpoints: [
    { endpoint: "merge-pdfs", visits: 1640, percentage: 34.0 },
    { endpoint: "compress-pdf", visits: 1120, percentage: 23.2 },
    { endpoint: "sign", visits: 880, percentage: 18.3 },
    { endpoint: "ocr-pdf", visits: 540, percentage: 11.2 },
    { endpoint: "add-watermark", visits: 380, percentage: 7.9 },
    { endpoint: "split-pages", visits: 260, percentage: 5.4 },
  ],
};

const STATISTICS_PATH = "/api/v1/proprietary/ui-data/usage-endpoint-statistics";

const meta = {
  title: "Config/AdminUsageSection",
  component: AdminUsageSection,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [http.get(STATISTICS_PATH, () => HttpResponse.json(STATISTICS))],
    },
  },
  decorators: [withConfig({ enableLogin: true })],
} satisfies Meta<typeof AdminUsageSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No enterprise licence: demo figures behind the enterprise banner, controls frozen. */
export const Default: Story = {};

/** Login mode off as well, so both the login and enterprise banners are raised. */
export const LoginDisabled: Story = {
  decorators: [withConfig({ enableLogin: false })],
};

/**
 * Licensed and logged in: real statistics, live controls, and the explanatory
 * banner linking through to the audit dashboard.
 */
export const EnterpriseLicensed: Story = {
  decorators: [withConfig({ enableLogin: true, license: "ENTERPRISE" })],
};

/** While the statistics request is in flight, a centred loader replaces the dashboard. */
export const Loading: Story = {
  decorators: [withConfig({ enableLogin: true, license: "ENTERPRISE" })],
  parameters: {
    msw: {
      handlers: [
        http.get(STATISTICS_PATH, async () => {
          await delay("infinite");
          return HttpResponse.json(STATISTICS);
        }),
      ],
    },
  },
};

/** The statistics request failed: an error alert replaces the dashboard entirely. */
export const LoadError: Story = {
  decorators: [withConfig({ enableLogin: true, license: "ENTERPRISE" })],
  parameters: {
    msw: {
      handlers: [
        http.get(STATISTICS_PATH, () =>
          HttpResponse.json(null, { status: 500 }),
        ),
      ],
    },
  },
};

/** Licensed, but the instance has recorded no traffic yet. */
export const NoTrafficRecorded: Story = {
  decorators: [withConfig({ enableLogin: true, license: "ENTERPRISE" })],
  parameters: {
    msw: {
      handlers: [
        http.get(STATISTICS_PATH, () =>
          HttpResponse.json({
            totalVisits: 0,
            totalEndpoints: 0,
            endpoints: [],
          } satisfies EndpointStatisticsResponse),
        ),
      ],
    },
  },
};
