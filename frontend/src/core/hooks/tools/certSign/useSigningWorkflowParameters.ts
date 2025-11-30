import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface SigningWorkflowParameters extends BaseParameters {
  participantEmails: string;
  participantNames: string;
  message: string;
  ownerEmail: string;
  dueDate: string;
  notifyOnCreate: boolean;
}

export const defaultSigningWorkflowParameters: SigningWorkflowParameters = {
  participantEmails: '',
  participantNames: '',
  message: '',
  ownerEmail: '',
  dueDate: '',
  notifyOnCreate: true,
};

export type SigningWorkflowParametersHook = BaseParametersHook<SigningWorkflowParameters>;

export const useSigningWorkflowParameters = (): SigningWorkflowParametersHook => {
  return useBaseParameters({
    defaultParameters: defaultSigningWorkflowParameters,
    endpointName: 'signing-workflow',
    validateFn: (params) => {
      const emails = params.participantEmails.split(',').map((email) => email.trim()).filter(Boolean);
      return emails.length > 0;
    },
  });
};
