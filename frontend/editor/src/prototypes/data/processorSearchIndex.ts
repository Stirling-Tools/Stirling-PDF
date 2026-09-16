/**
 * Prototypes builds ship no portal (and have no @processor alias) — shadow the
 * index back to core's empty list so the super search never resolves the
 * proprietary version's portal-flavored imports here.
 */
export type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";
export {
  PROCESSOR_SEARCH_INDEX,
  isProcessorEntityScopeAccessible,
} from "@core/data/processorSearchIndex";
