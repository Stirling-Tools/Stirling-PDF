import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { SigningWorkflowParameters, defaultSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';

const buildSessionFormData = (parameters: SigningWorkflowParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  parameters.participantEmails.split(',').map((email) => email.trim()).filter(Boolean).forEach((email) => {
    formData.append('participantEmails', email);
  });

  parameters.participantNames.split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => {
    formData.append('participantNames', name);
  });

  if (parameters.message) {
    formData.append('message', parameters.message);
  }
  if (parameters.ownerEmail) {
    formData.append('ownerEmail', parameters.ownerEmail);
  }
  if (parameters.dueDate) {
    formData.append('dueDate', parameters.dueDate);
  }
  formData.append('notifyOnCreate', parameters.notifyOnCreate ? 'true' : 'false');

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

    // Log participant URLs for easy testing
    console.log('\n🔐 Signing Session Created!');
    console.log('📄 Session ID:', data.sessionId);
    console.log('\n👥 Participant Links:');
    data.participants?.forEach((participant: any, index: number) => {
      console.log(`\n${index + 1}. ${participant.email}${participant.name ? ` (${participant.name})` : ''}`);
      console.log(`   ${participant.participantUrl}`);
    });
    console.log('\n');

    if (parameters.notifyOnCreate) {
      await apiClient.post(`/api/v1/security/cert-sign/sessions/${data.sessionId}/notify`, {
        message: parameters.message,
      });
    }

    // Return empty array since we don't need files - session data is in response
    // The session data will be available via operation.data
    return { files: [], data };
  },
} as const;

export const useSigningWorkflowOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SigningWorkflowParameters>({
    ...signingWorkflowOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('certSign.collab.error', 'Unable to start shared signing session. Please verify participant emails and try again.'),
    ),
  });
};
