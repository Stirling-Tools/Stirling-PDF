/** Shared cache identities keep editor-side changes reflected in the Processor. */
export const pipelineQueryKeys = {
  pipelines: () => ["portal", "pipelines"] as const,
  policiesList: () => ["portal", "policies", "list"] as const,
};
