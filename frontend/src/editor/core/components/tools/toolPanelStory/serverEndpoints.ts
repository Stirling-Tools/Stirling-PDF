import { useEffect } from "react";
import { useTranslatedToolCatalog } from "@editor/data/useTranslatedToolRegistry";
import { EXTENSION_TO_ENDPOINT } from "@editor/constants/convertConstants";

let publishEndpoints: (names: readonly string[]) => void = () => {};
const toolEndpoints = new Promise<readonly string[]>((resolve) => {
  publishEndpoints = resolve;
});

/**
 * Publishes every endpoint the editor's tools call, read from the editor's own
 * tool catalog, for the mocked server's endpoint list. Must render inside the
 * editor's providers; the server's answer waits until it has.
 */
export function usePublishToolEndpoints(): void {
  const { allTools } = useTranslatedToolCatalog();
  useEffect(() => {
    const names = new Set(
      Object.values(EXTENSION_TO_ENDPOINT).flatMap(Object.values),
    );
    for (const tool of Object.values(allTools))
      for (const endpoint of tool.endpoints ?? []) names.add(endpoint);
    publishEndpoints([...names]);
  }, [allTools]);
}

/**
 * The server's endpoints-availability answer: every tool endpoint listed, as a
 * real backend lists them, and enabled unless named in `unavailable`. The
 * desktop build reads a missing endpoint as one its bundled backend lacks, and
 * then refuses the tool without an account.
 */
export async function endpointsAvailability(
  ...unavailable: string[]
): Promise<Record<string, { enabled: boolean; reason: string | null }>> {
  const names = new Set([...(await toolEndpoints), ...unavailable]);
  return Object.fromEntries(
    [...names].map((name) => [
      name,
      unavailable.includes(name)
        ? { enabled: false, reason: "DEPENDENCY" }
        : { enabled: true, reason: null },
    ]),
  );
}
