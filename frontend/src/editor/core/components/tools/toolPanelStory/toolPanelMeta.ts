import type { Meta } from "@storybook/react-vite";
import { http, HttpResponse, type RequestHandler } from "msw";
import {
  ToolPanelStory,
  type ToolPanelStoryProps,
} from "@editor/components/tools/toolPanelStory/ToolPanelStory";
import { waitForToolPanel } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { endpointsAvailability } from "@editor/components/tools/toolPanelStory/serverEndpoints";
import {
  loadFixture,
  type FixtureName,
} from "@editor/components/tools/toolPanelStory/fixtures";
import type { ToolId } from "@editor/types/toolId";

/**
 * A started server's app-config: the AI engine on, and the backend's
 * dependencies ready, which the desktop build waits for before it runs a tool.
 */
const SERVER_APP_CONFIG = { aiEngineEnabled: true, dependenciesReady: true };

/**
 * A server that has every tool endpoint on and the AI engine enabled. Without
 * an answer the panel holds its settings disabled while it waits, so a capture
 * would show greyed controls and a click would be dropped. Matched at any
 * origin: the desktop build reaches its bundled backend at 127.0.0.1, and treats
 * the backend as down until app-config answers.
 */
const DEFAULT_SERVER = [
  http.get("*/api/v1/config/app-config", () =>
    HttpResponse.json(SERVER_APP_CONFIG),
  ),
  http.get("*/api/v1/config/endpoint-enabled", () => HttpResponse.json(true)),
  http.get("*/api/v1/config/endpoints-availability", async () =>
    HttpResponse.json(await endpointsAvailability()),
  ),
];

/**
 * A story's `parameters` for the server responses its panel reads. Pass every
 * response the story needs here rather than as a raw `msw.handlers` array: a
 * story's array replaces the meta's, and these are listed ahead of the
 * defaults so they win over them.
 */
export function toolPanelServer(...handlers: RequestHandler[]) {
  return { msw: { handlers: [...handlers, ...DEFAULT_SERVER] } };
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
    http.get("*/api/v1/config/endpoints-availability", async () =>
      HttpResponse.json(await endpointsAvailability(endpoint)),
    ),
  ];
}

/**
 * The server's app-config with `flags` on, for settings a server flag reveals.
 * Keeps the rest of the default server's app-config.
 */
export function appConfig(flags: Readonly<Record<string, unknown>>) {
  return http.get("*/api/v1/config/app-config", () =>
    HttpResponse.json({ ...SERVER_APP_CONFIG, ...flags }),
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
 * A server that answers a POST to `endpoint` with a ZIP of fixture files, for
 * a tool that unzips its response into several results (Split, Remove Blanks).
 */
export function zipResponse(
  endpoint: string,
  fixtures: readonly FixtureName[],
) {
  return http.post(`*${endpoint}`, async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const name of fixtures) zip.file(name, await loadFixture(name));
    return new HttpResponse(await zip.generateAsync({ type: "blob" }), {
      headers: { "Content-Type": "application/zip" },
    });
  });
}

/**
 * A story's `parameters` for an accessibility bug the real panel has: the scan
 * skips only these axe rules, on this story, so the rest of the panel stays
 * checked. Each use is listed with the bug it stands for; the app is not
 * changed from a story.
 */
export function knownA11yIssues(...rules: string[]) {
  return {
    a11y: { config: { rules: rules.map((id) => ({ id, enabled: false })) } },
  };
}

/**
 * A story that draws the editor's viewer beside the panel, for panel states
 * only the viewer reaches. The viewer fails these axe rules itself: page images
 * have no alt, the zoom slider and page-number input have no name, workbench-bar
 * popover targets put aria-expanded on a plain div, and the page scroller takes
 * no focus. Some fail only once pages paint, so all are skipped to keep the scan
 * stable. `panelRules` adds the panel's own known issues for the story.
 */
export function onViewer(...panelRules: string[]) {
  return {
    args: { showWorkbench: true, workbench: "viewer" },
    parameters: knownA11yIssues(
      "aria-allowed-attr",
      "aria-input-field-name",
      "image-alt",
      "label",
      "scrollable-region-focusable",
      ...panelRules,
    ),
  } as const;
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
