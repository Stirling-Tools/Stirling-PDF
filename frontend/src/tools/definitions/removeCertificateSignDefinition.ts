import { ToolDefinition } from '../../components/tools/shared/toolDefinition';
import { RemoveCertificateSignParameters, useRemoveCertificateSignParameters } from '../../hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters';
import { useRemoveCertificateSignOperation } from '../../hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation';

export const removeCertificateSignDefinition: ToolDefinition<RemoveCertificateSignParameters> = {
  id: 'removeCertificateSign',

  useParameters: useRemoveCertificateSignParameters,
  useOperation: useRemoveCertificateSignOperation,

  steps: [],

  executeButton: {
    text: (t) => t("removeCertSign.submit", "Remove Signature"),
    loadingText: (t) => t("loading"),
  },

  review: {
    title: (t) => t("removeCertSign.results.title", "Certificate Removal Results"),
  },
};
