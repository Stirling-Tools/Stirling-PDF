import apiClient from "@app/services/apiClient";

/** Source overview fields needed to choose a saved processing destination. */
export interface PolicySource {
  id: string;
  name: string;
  type: string;
  status: "active" | "unused" | "disabled";
}

/** Saved sources visible to the current user; credentials remain on the server. */
export async function fetchPolicySources(): Promise<PolicySource[]> {
  const { data } = await apiClient.get<{ sources: PolicySource[] }>(
    "/api/v1/sources",
    { suppressErrorToast: true },
  );
  return data.sources;
}

/** Both template surfaces offer enabled sources with a writable type supported by their backend. */
export function routingDestinations(sources: PolicySource[], modes: string[]) {
  return sources
    .filter(
      (source) => source.status !== "disabled" && modes.includes(source.type),
    )
    .map(({ id, name }) => ({ id, name }));
}
