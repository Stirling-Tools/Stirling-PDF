// Tracking disabled for self-hosted/public build.
export function setScarfConfig(_scarfEnabled: boolean | null, _consentChecker: (service: string, category: string) => boolean): void {
  return;
}

export function firePixel(_pathname: string): void {
  return;
}

export function resetScarfConfig(): void {
  return;
}
