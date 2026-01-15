import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface SigningWorkflowParameters extends BaseParameters {
  participantUserIds: number[];
  message: string;
  dueDate: string;
  notifyOnCreate: boolean;
  // Signature appearance settings (applied to all participants)
  showSignature?: boolean;
  pageNumber?: number;
  reason?: string;
  location?: string;
  showLogo?: boolean;
}

export const defaultSigningWorkflowParameters: SigningWorkflowParameters = {
  participantUserIds: [],
  message: '',
  dueDate: '',
  notifyOnCreate: true,
  showSignature: false,
  pageNumber: 1,
  reason: '',
  location: '',
  showLogo: false,
};

export type SigningWorkflowParametersHook = BaseParametersHook<SigningWorkflowParameters>;

export const useSigningWorkflowParameters = (): SigningWorkflowParametersHook => {
  return useBaseParameters({
    defaultParameters: defaultSigningWorkflowParameters,
    endpointName: 'signing-workflow',
    validateFn: (params) => {
      return params.participantUserIds.length > 0;
    },
  });
};
