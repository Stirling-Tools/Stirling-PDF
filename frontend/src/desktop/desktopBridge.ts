import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Desktop implementation for completing self-hosted deep link SSO.
 */
export async function completeSelfHostedDeepLink(serverUrl: string): Promise<void> {
  await connectionModeService.switchToSelfHosted({ url: serverUrl });
  await tauriBackendService.initializeExternalBackend();
}
