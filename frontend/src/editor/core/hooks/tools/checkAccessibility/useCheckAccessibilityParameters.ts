import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export type AccessibilityProfile = "ua1" | "ua2";

export interface CheckAccessibilityParameters extends BaseParameters {
  profile: AccessibilityProfile;
}

export const defaultParameters: CheckAccessibilityParameters = {
  profile: "ua1",
};

export type CheckAccessibilityParametersHook =
  BaseParametersHook<CheckAccessibilityParameters>;

export const useCheckAccessibilityParameters =
  (): CheckAccessibilityParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "accessibility-report",
    });
  };
