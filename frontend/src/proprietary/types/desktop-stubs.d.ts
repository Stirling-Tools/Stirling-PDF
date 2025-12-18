// Desktop bridge stub for proprietary build
declare module '@desktop/bridge' {
  export function completeSelfHostedDeepLink(serverUrl: string): Promise<void>;
}

// Desktop authService stub for proprietary build (no-op)
declare module '@app/services/authService' {
  export const authService: {
    localClearAuth: () => Promise<void>;
  };
}
