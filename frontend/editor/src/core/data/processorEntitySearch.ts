import type { TFunction } from "i18next";
import type { SuperSearchGroup } from "@app/types/superSearch";

const NO_GROUPS: SuperSearchGroup[] = [];

/**
 * Processor entity results (users, policies, pipelines, sources) for the
 * editor's super search. Core and desktop builds ship no portal, so this stub
 * returns nothing; the proprietary build shadows it with an implementation
 * that lazily loads the portal's entity-search module.
 */
export function useProcessorEntityGroups(
  _trimmed: string,
  _enabled: boolean,
  _t: TFunction,
  _navigate: (path: string) => void,
): SuperSearchGroup[] {
  return NO_GROUPS;
}
