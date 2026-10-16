import { useCallback, useMemo } from "react";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { EXTENSION_TO_ENDPOINT } from "@app/constants/convertConstants";
import { getConversionEndpoints } from "@app/data/toolsTaxonomy";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useConversionCloudStatus } from "@app/hooks/useConversionCloudStatus";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";

export interface ConversionAvailability {
  isConversionAvailable: (fromExt: string, toExt: string) => boolean;
  doesConversionUseCloud: (fromExt: string, toExt: string) => boolean;
  /** Unavailable conversions are left out rather than shown greyed. */
  hideUnavailableConversions: boolean;
}

/**
 * Which conversions this session can run, as Convert's format pickers show
 * them — shared so search offers conversion subtools the same way.
 */
export function useConversionAvailability(): ConversionAvailability {
  const { preferences } = usePreferences();
  const localProcessingOnly = useLocalProcessingOnly();
  const allEndpoints = useMemo(
    () => getConversionEndpoints(EXTENSION_TO_ENDPOINT),
    [],
  );
  const { endpointStatus } = useMultipleEndpointsEnabled(allEndpoints);
  // Comprehensive conversion status (availability + cloud routing)
  const conversionStatus = useConversionCloudStatus();

  const isConversionAvailable = useCallback(
    (fromExt: string, toExt: string): boolean => {
      const conversionKey = `${fromExt}-${toExt}`;

      // In desktop SaaS mode, check combined availability (local OR SaaS)
      if (conversionStatus.availability[conversionKey] !== undefined) {
        return conversionStatus.availability[conversionKey];
      }

      // Fallback to local-only check (web mode or desktop non-SaaS mode)
      const endpointKey = EXTENSION_TO_ENDPOINT[fromExt]?.[toExt];
      if (!endpointKey) return false;
      return endpointStatus[endpointKey] === true;
    },
    [conversionStatus, endpointStatus],
  );

  const doesConversionUseCloud = useCallback(
    (fromExt: string, toExt: string): boolean =>
      conversionStatus.cloudStatus[`${fromExt}-${toExt}`] || false,
    [conversionStatus],
  );

  return {
    isConversionAvailable,
    doesConversionUseCloud,
    hideUnavailableConversions:
      localProcessingOnly || preferences.hideUnavailableConversions,
  };
}
