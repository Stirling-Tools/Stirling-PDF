import type { Meta } from "@storybook/react-vite";
import { http, HttpResponse, type RequestHandler } from "msw";
import {
  ToolPanelStory,
  type ToolPanelStoryProps,
} from "@editor/components/tools/toolPanelStory/ToolPanelStory";
import { waitForToolPanel } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import {
  loadFixture,
  type FixtureName,
} from "@editor/components/tools/toolPanelStory/fixtures";
import type { ToolId } from "@editor/types/toolId";

/**
 * A server that has every tool endpoint on. Without an answer the panel holds
 * its settings disabled while it waits, so a capture would show greyed
 * controls and a click would be dropped.
 */
const ENDPOINTS_ENABLED = [
  http.get("*/api/v1/config/endpoint-enabled", () => HttpResponse.json(true)),
  http.get("*/api/v1/config/endpoints-availability", () =>
    HttpResponse.json({}),
  ),
];

/**
 * A story's `parameters` for the server responses its panel reads. Pass every
 * response the story needs here rather than as a raw `msw.handlers` array: a
 * story's array replaces the meta's, and these are listed ahead of the
 * defaults so they win over them.
 */
export function toolPanelServer(...handlers: RequestHandler[]) {
  return { msw: { handlers: [...handlers, ...ENDPOINTS_ENABLED] } };
}

/**
 * A server that reports `endpoint` unavailable for a missing dependency and
 * every other endpoint on. Spread into toolPanelServer.
 */
export function endpointUnavailable(endpoint: string): RequestHandler[] {
  return [
    http.get("*/api/v1/config/endpoint-enabled", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("endpoint") !== endpoint,
      ),
    ),
    http.get("*/api/v1/config/endpoints-availability", () =>
      HttpResponse.json({
        [endpoint]: { enabled: false, reason: "DEPENDENCY" },
      }),
    ),
  ];
}

/**
 * The server's app-config with `flags` on, for settings a server flag reveals.
 * Keeps the AI engine on, as the default Storybook server has it.
 */
export function appConfig(flags: Readonly<Record<string, unknown>>) {
  return http.get("*/api/v1/config/app-config", () =>
    HttpResponse.json({ aiEngineEnabled: true, ...flags }),
  );
}

/**
 * A server that answers a POST to `endpoint` with a fixture file, as a tool's
 * result, so a story can run the tool and show the panel's result state.
 */
export function fixtureResponse(
  endpoint: string,
  fixture: FixtureName,
  headers?: Readonly<Record<string, string>>,
) {
  return http.post(`*${endpoint}`, async () => {
    const file = await loadFixture(fixture);
    return new HttpResponse(file, {
      headers: { "Content-Type": file.type, ...headers },
    });
  });
}

/**
 * The shared Storybook meta for one tool's panel stories. Spread it beside a
 * literal `title: "Tools/<Tool name>/Panel"`: Storybook reads the title
 * statically and falls back to the file path for a computed one, and reads a
 * "/" in the name as a nested group, so a name containing one uses "&". The
 * tool's other components sit beside it under `Tools/<Tool name>/Parts`.
 * Every story waits for the panel to finish staging before it is scanned or
 * captured; a story with its own play (a tooltip) does that wait itself.
 */
export function toolPanelMeta(
  toolId: ToolId,
  args?: Omit<ToolPanelStoryProps, "toolId">,
) {
  return {
    component: ToolPanelStory,
    parameters: { layout: "fullscreen", ...toolPanelServer() },
    args: { toolId, ...args },
    play: async (context) => {
      await waitForToolPanel(context);
    },
  } satisfies Meta<typeof ToolPanelStory>;
}
