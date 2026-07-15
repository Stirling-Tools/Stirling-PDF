/**
 * Desktop inherits proprietary's app but must NOT ship the portal (see the
 * admin-route seam) — shadow the index back to core's empty list so the super
 * search never offers Processor destinations that don't exist on desktop.
 */
export type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";
export { PROCESSOR_SEARCH_INDEX } from "@core/data/processorSearchIndex";
