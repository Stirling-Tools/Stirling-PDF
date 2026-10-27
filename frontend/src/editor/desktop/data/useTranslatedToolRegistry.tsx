import { useMemo } from "react";
import {
  useTranslatedToolCatalog as useCoreCatalog,
  type TranslatedToolCatalog,
} from "@editor-core/data/useTranslatedToolRegistry";
import { useLocalProcessingOnly } from "@editor/hooks/useLocalProcessingOnly";
import { useMultipleEndpointsEnabled } from "@editor/hooks/useEndpointConfig";
import type { ToolRegistryEntry } from "@editor/data/toolsTaxonomy";

export type { TranslatedToolCatalog } from "@editor-core/data/useTranslatedToolRegistry";

/** Hide server-only tools from every catalogue consumer, including search and favourites. */
export function useTranslatedToolCatalog(): TranslatedToolCatalog {
  const catalog = useCoreCatalog();
  const localOnly = useLocalProcessingOnly();
  const endpoints = useMemo(
    () =>
      localOnly
        ? [
            ...new Set(
              Object.values(catalog.allTools).flatMap(
                (tool) => tool.endpoints ?? [],
              ),
            ),
          ]
        : [],
    [catalog, localOnly],
  );
  const { endpointStatus } = useMultipleEndpointsEnabled(endpoints);
  return useMemo(() => {
    const restrict = <T extends Record<string, ToolRegistryEntry>>(
      registry: T,
    ): T =>
      Object.fromEntries(
        Object.entries(registry).map(([id, tool]) => [
          id,
          {
            ...tool,
            hiddenFromToolList:
              tool.hiddenFromToolList ||
              Boolean(
                tool.endpoints?.length &&
                !tool.endpoints.some(
                  (endpoint) => endpointStatus[endpoint] === true,
                ),
              ),
          },
        ]),
      ) as T;
    // Desktop bundles no springdoc, so the API link would open a 404 even
    // against a self-hosted server. Remove it from every catalogue surface.
    const withoutApiDocs = <T extends object>(registry: T): T =>
      Object.fromEntries(
        Object.entries(registry).filter(([id]) => id !== "devApi"),
      ) as T;
    const restricted = localOnly
      ? {
          allTools: restrict(catalog.allTools),
          regularTools: restrict(catalog.regularTools),
          superTools: restrict(catalog.superTools),
          linkTools: catalog.linkTools,
        }
      : catalog;
    return {
      allTools: withoutApiDocs(restricted.allTools),
      regularTools: withoutApiDocs(restricted.regularTools),
      superTools: withoutApiDocs(restricted.superTools),
      linkTools: withoutApiDocs(restricted.linkTools),
    };
  }, [catalog, endpointStatus, localOnly]);
}
