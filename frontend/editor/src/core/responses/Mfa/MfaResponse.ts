export interface MfaErrorResponse {
  error: string;
}

export interface MfaSetupResponse {
  otpauthUri: string | null;
  secret: string | null;
  error: MfaErrorResponse | null;
}

export interface MfaSetupCancelResponse {
  cleared: boolean | null;
  error: MfaErrorResponse | null;
}

/**
 * /mfa/disable/admin/{username}
 * /mfa/disable
 * /mfa/enable
 */
export interface MfaStatusResponse {
  enabled: boolean | null;
  error: MfaErrorResponse | null;
}
