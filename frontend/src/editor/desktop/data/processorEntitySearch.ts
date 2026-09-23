/**
 * Desktop inherits proprietary's app but must NOT ship the portal (see the
 * admin-route seam) — shadow the entity search back to core's empty stub so
 * the super search never fetches or offers Processor entities on desktop.
 */
export { useProcessorEntityGroups } from "@core/data/processorEntitySearch";
