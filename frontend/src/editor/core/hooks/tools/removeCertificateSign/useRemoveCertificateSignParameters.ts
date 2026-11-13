import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface RemoveCertificateSignParameters extends BaseParameters {
  removeVisibleSignature: boolean;
}

export const defaultParameters: RemoveCertificateSignParameters = {
  removeVisibleSignature: false,
};

export type RemoveCertificateSignParametersHook =
  BaseParametersHook<RemoveCertificateSignParameters>;

export const useRemoveCertificateSignParameters =
  (): RemoveCertificateSignParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "remove-cert-sign",
    });
  };
