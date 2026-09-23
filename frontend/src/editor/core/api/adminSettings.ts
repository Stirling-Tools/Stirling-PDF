import apiClient from "@app/services/apiClient";

export async function fetchAdminSection<T>(sectionName: string): Promise<T> {
  const response = await apiClient.get<T>(
    `/api/v1/admin/settings/section/${sectionName}`,
  );
  return (response.data ?? {}) as T;
}

export async function putAdminSection(
  sectionName: string,
  delta: unknown,
): Promise<void> {
  await apiClient.put(`/api/v1/admin/settings/section/${sectionName}`, delta);
}

/** Flat dotted-path settings, for sections that write outside their own block. */
export async function putAdminSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  await apiClient.put("/api/v1/admin/settings", { settings });
}
