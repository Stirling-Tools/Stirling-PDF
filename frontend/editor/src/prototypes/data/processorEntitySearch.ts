/**
 * Prototypes builds ship no portal (and have no @portal alias) — shadow the
 * entity search back to core's empty stub so the super search never resolves
 * the proprietary implementation's portal imports here.
 */
export { useProcessorEntityGroups } from "@core/data/processorEntitySearch";
