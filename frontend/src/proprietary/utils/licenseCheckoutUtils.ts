/**
 * Shared utilities for license checkout completion
 * Used by both embedded and hosted checkout flows
 */

import licenseService, { LicenseInfo } from '@app/services/licenseService';

/**
 * Result of license key polling
 */
export interface LicenseKeyPollResult {
  success: boolean;
  licenseKey?: string;
  error?: string;
  timedOut?: boolean;
}

/**
 * Configuration for license key polling
 */
export interface PollConfig {
  /** Check if component is still mounted (prevents state updates after unmount) */
  isMounted?: () => boolean;
  /** Callback for status changes during polling */
  onStatusChange?: (status: 'polling' | 'ready' | 'timeout') => void;
  /** Custom backoff intervals in milliseconds (default: [1000, 2000, 4000, 8000, 16000]) */
  backoffMs?: number[];
}

/**
 * Poll for license key with exponential backoff
 * Consolidates polling logic used by both embedded and hosted checkout
 */
export async function pollLicenseKeyWithBackoff(
  installationId: string,
  config: PollConfig = {}
): Promise<LicenseKeyPollResult> {
  const {
    isMounted = () => true,
    onStatusChange,
    backoffMs = [1000, 2000, 4000, 8000, 16000],
  } = config;

  let attemptIndex = 0;

  onStatusChange?.('polling');
  console.log(`Starting license key polling for installation: ${installationId}`);

  const poll = async (): Promise<LicenseKeyPollResult> => {
    // Check if component is still mounted
    if (!isMounted()) {
      console.log('Polling cancelled: component unmounted');
      return { success: false, error: 'Component unmounted' };
    }

    const attemptNumber = attemptIndex + 1;
    console.log(`Polling attempt ${attemptNumber}/${backoffMs.length}`);

    try {
      const response = await licenseService.checkLicenseKey(installationId);

      // Check mounted after async operation
      if (!isMounted()) {
        return { success: false, error: 'Component unmounted' };
      }

      if (response.status === 'ready' && response.license_key) {
        console.log('✅ License key ready!');
        onStatusChange?.('ready');
        return {
          success: true,
          licenseKey: response.license_key,
        };
      }

      // License not ready yet, continue polling
      attemptIndex++;

      if (attemptIndex >= backoffMs.length) {
        console.warn('⏱️ License polling timeout after all attempts');
        onStatusChange?.('timeout');
        return {
          success: false,
          timedOut: true,
          error: 'Polling timeout - license key not ready',
        };
      }

      // Wait before next attempt
      const nextDelay = backoffMs[attemptIndex];
      console.log(`Retrying in ${nextDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));

      return poll();
    } catch (error) {
      console.error(`Polling attempt ${attemptNumber} failed:`, error);

      if (!isMounted()) {
        return { success: false, error: 'Component unmounted' };
      }

      attemptIndex++;

      if (attemptIndex >= backoffMs.length) {
        console.error('Polling failed after all attempts');
        onStatusChange?.('timeout');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Polling failed',
        };
      }

      // Retry with exponential backoff even on error
      const nextDelay = backoffMs[attemptIndex];
      console.log(`Retrying after error in ${nextDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));

      return poll();
    }
  };

  return poll();
}

/**
 * Result of license key activation
 */
export interface LicenseActivationResult {
  success: boolean;
  licenseType?: string;
  licenseInfo?: LicenseInfo;
  error?: string;
}

/**
 * Activate a license key by saving it to the backend and fetching updated info
 * Used for NEW subscriptions where we have a new license key to save
 */
export async function activateLicenseKey(
  licenseKey: string,
  options: {
    /** Check if component is still mounted */
    isMounted?: () => boolean;
    /** Callback when license is activated with updated info */
    onActivated?: (licenseInfo: LicenseInfo) => void;
  } = {}
): Promise<LicenseActivationResult> {
  const { isMounted = () => true, onActivated } = options;

  try {
    console.log('Activating license key...');
    const saveResponse = await licenseService.saveLicenseKey(licenseKey);

    if (!isMounted()) {
      return { success: false, error: 'Component unmounted' };
    }

    if (saveResponse.success) {
      console.log(`License key activated: ${saveResponse.licenseType}`);

      // Fetch updated license info
      try {
        const licenseInfo = await licenseService.getLicenseInfo();

        if (!isMounted()) {
          return { success: false, error: 'Component unmounted' };
        }

        onActivated?.(licenseInfo);

        return {
          success: true,
          licenseType: saveResponse.licenseType,
          licenseInfo,
        };
      } catch (infoError) {
        console.error('Error fetching license info after activation:', infoError);
        // Still return success since save succeeded
        return {
          success: true,
          licenseType: saveResponse.licenseType,
          error: 'Failed to fetch updated license info',
        };
      }
    } else {
      console.error('Failed to save license key:', saveResponse.error);
      return {
        success: false,
        error: saveResponse.error || 'Failed to save license key',
      };
    }
  } catch (error) {
    console.error('Error activating license key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Activation failed',
    };
  }
}

/**
 * Resync existing license with Keygen
 * Used for UPGRADES where we already have a license key configured
 * Calls the dedicated resync endpoint instead of re-saving the same key
 */
export async function resyncExistingLicense(
  options: {
    /** Check if component is still mounted */
    isMounted?: () => boolean;
    /** Callback when license is resynced with updated info */
    onActivated?: (licenseInfo: LicenseInfo) => void;
  } = {}
): Promise<LicenseActivationResult> {
  const { isMounted = () => true, onActivated } = options;

  try {
    console.log('Resyncing existing license with Keygen...');
    const resyncResponse = await licenseService.resyncLicense();

    if (!isMounted()) {
      return { success: false, error: 'Component unmounted' };
    }

    if (resyncResponse.success) {
      console.log(`License resynced: ${resyncResponse.licenseType}`);

      // Fetch updated license info
      try {
        const licenseInfo = await licenseService.getLicenseInfo();

        if (!isMounted()) {
          return { success: false, error: 'Component unmounted' };
        }

        onActivated?.(licenseInfo);

        return {
          success: true,
          licenseType: resyncResponse.licenseType,
          licenseInfo,
        };
      } catch (infoError) {
        console.error('Error fetching license info after resync:', infoError);
        // Still return success since resync succeeded
        return {
          success: true,
          licenseType: resyncResponse.licenseType,
          error: 'Failed to fetch updated license info',
        };
      }
    } else {
      console.error('Failed to resync license:', resyncResponse.error);
      return {
        success: false,
        error: resyncResponse.error || 'Failed to resync license',
      };
    }
  } catch (error) {
    console.error('Error resyncing license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Resync failed',
    };
  }
}
