export interface FrontendVersionInfo {
  appVersion: string | null | undefined; // undefined = not applicable, null = loading, string = loaded
  mismatchVersion: boolean;
}

export function useFrontendVersionInfo(
  _backendVersion: string | undefined,
): FrontendVersionInfo {
  return { appVersion: undefined, mismatchVersion: false };
}
