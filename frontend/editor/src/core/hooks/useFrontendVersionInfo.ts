export interface FrontendVersionInfo {
  appVersion: string | null | undefined; // undefined = not applicable, null = loading, string = loaded
  /** Backend version to display and compare, when relevant to this connection. */
  backendVersion: string | undefined;
  mismatchVersion: boolean;
}

export function useFrontendVersionInfo(
  backendVersion: string | undefined,
): FrontendVersionInfo {
  return { appVersion: undefined, backendVersion, mismatchVersion: false };
}
