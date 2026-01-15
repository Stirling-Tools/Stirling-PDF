import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { SigningWorkflowParameters, defaultSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';

const buildSessionFormData = (parameters: SigningWorkflowParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  parameters.participantUserIds.forEach((userId) => {
    formData.append('participantUserIds', userId.toString());
  });

  if (parameters.message) {
    formData.append('message', parameters.message);
  }
  if (parameters.dueDate) {
    formData.append('dueDate', parameters.dueDate);
  }

  // Signature appearance settings (applied to all participants)
  if (parameters.showSignature !== undefined) {
    formData.append('showSignature', parameters.showSignature.toString());
  }
  if (parameters.pageNumber) {
    formData.append('pageNumber', parameters.pageNumber.toString());
  }
  if (parameters.reason) {
    formData.append('reason', parameters.reason);
  }
  if (parameters.location) {
    formData.append('location', parameters.location);
  }
  if (parameters.showLogo !== undefined) {
    formData.append('showLogo', parameters.showLogo.toString());
  }

  return formData;
};

export const signingWorkflowOperationConfig = {
  toolType: ToolType.custom,
  operationType: 'signingWorkflow',
  defaultParameters: defaultSigningWorkflowParameters,
  customProcessor: async (parameters: SigningWorkflowParameters, files: File[]) => {
    if (files.length === 0) {
      throw new Error('A PDF file is required to start a signing workflow');
    }

    const formData = buildSessionFormData(parameters, files[0]);
    const { data } = await apiClient.post('/api/v1/security/cert-sign/sessions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    // Log session info for easy testing
    console.log('\n🔐 Signing Session Created!');
    console.log('📄 Session ID:', data.sessionId);
    console.log('👥 Participants:', data.participants?.length || 0);
    console.log('\n');

    if (parameters.notifyOnCreate) {
      await apiClient.post(`/api/v1/security/cert-sign/sessions/${data.sessionId}/notify`, {
        message: parameters.message,
      });
    }

    // Return empty array - session is created on server, no files produced
    return [];
  },
} as const;

export const useSigningWorkflowOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SigningWorkflowParameters>({
    ...signingWorkflowOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('certSign.collab.error', 'Unable to start shared signing session. Please verify participant selection and try again.'),
    ),
  });
};
