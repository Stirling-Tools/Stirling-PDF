import i18n from '@app/i18n';

export const BACKEND_NOT_READY_CODE = 'BACKEND_NOT_READY' as const;

export interface BackendNotReadyError extends Error {
  code: typeof BACKEND_NOT_READY_CODE;
}

export function createBackendNotReadyError(): BackendNotReadyError {
  return Object.assign(new Error(i18n.t('backendHealth.starting', 'Backend starting up...')), {
    code: BACKEND_NOT_READY_CODE,
  });
}

export function isBackendNotReadyError(error: unknown): error is BackendNotReadyError {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === BACKEND_NOT_READY_CODE;
}
