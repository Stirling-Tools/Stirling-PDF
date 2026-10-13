import { useMemo } from "react";
import {
  useTranslatedToolCatalog as useCoreCatalog,
  type TranslatedToolCatalog,
} from "@core/data/useTranslatedToolRegistry";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";

export type { TranslatedToolCatalog } from "@core/data/useTranslatedToolRegistry";

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
    if (!localOnly) return catalog;
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
    return {
      allTools: restrict(catalog.allTools),
      regularTools: restrict(catalog.regularTools),
      superTools: restrict(catalog.superTools),
      linkTools: catalog.linkTools,
    };
  }, [catalog, endpointStatus, localOnly]);
}
