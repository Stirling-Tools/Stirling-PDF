import { useEffect, useRef, useState } from 'react';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';

/**
 * First launch check hook
 * Checks if this is the first time the app is being launched
 * Does not require FileContext - can be used early in the provider hierarchy
 */
export function useFirstLaunchCheck(): { isFirstLaunch: boolean; setupComplete: boolean } {
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const setupCheckCompleteRef = useRef(false);

  // Check if this is first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await connectionModeService.isFirstLaunch();
        setIsFirstLaunch(firstLaunch);

        if (!firstLaunch) {
          // Not first launch - initialize auth state
          await authService.initializeAuthState();
          setSetupComplete(true);
        }

        setupCheckCompleteRef.current = true;
      } catch (error) {
        console.error('Failed to check first launch:', error);
        // On error, assume not first launch and proceed
        setIsFirstLaunch(false);
        setSetupComplete(true);
        setupCheckCompleteRef.current = true;
      }
    };

    if (!setupCheckCompleteRef.current) {
      checkFirstLaunch();
    }
  }, []);

  return { isFirstLaunch, setupComplete };
}
