import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import SignRequestWorkbenchView from '@app/components/tools/certSign/SignRequestWorkbenchView';
import SessionDetailWorkbenchView from '@app/components/tools/certSign/SessionDetailWorkbenchView';

export interface WorkbenchRegistration {
  id: string;
  workbenchId: string;
  label: string;
  component: React.ComponentType<any>;
}

export interface UseSigningWorkbenchResult {
  signRequestWorkbench: {
    id: string;
    type: string;
  };
  sessionDetailWorkbench: {
    id: string;
    type: string;
  };
}

/**
 * Hook to manage custom workbench registration for signing workflows.
 * Automatically registers and unregisters workbenches on mount/unmount.
 */
export const useSigningWorkbench = (): UseSigningWorkbenchResult => {
  const { t } = useTranslation();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
  } = useToolWorkflow();

  // Define workbench IDs as constants
  const SIGN_REQUEST_WORKBENCH_ID = 'signRequestWorkbench';
  const SIGN_REQUEST_WORKBENCH_TYPE = 'custom:signRequestWorkbench' as const;
  const SESSION_DETAIL_WORKBENCH_ID = 'sessionDetailWorkbench';
  const SESSION_DETAIL_WORKBENCH_TYPE = 'custom:sessionDetailWorkbench' as const;

  // Register workbenches on mount
  useEffect(() => {
    registerCustomWorkbenchView({
      id: SIGN_REQUEST_WORKBENCH_ID,
      workbenchId: SIGN_REQUEST_WORKBENCH_TYPE,
      label: t('certSign.collab.signRequest.workbenchTitle', 'Sign Request'),
      component: SignRequestWorkbenchView,
    });

    registerCustomWorkbenchView({
      id: SESSION_DETAIL_WORKBENCH_ID,
      workbenchId: SESSION_DETAIL_WORKBENCH_TYPE,
      label: t('certSign.collab.sessionDetail.workbenchTitle', 'Session Management'),
      component: SessionDetailWorkbenchView,
    });

    return () => {
      unregisterCustomWorkbenchView(SIGN_REQUEST_WORKBENCH_ID);
      unregisterCustomWorkbenchView(SESSION_DETAIL_WORKBENCH_ID);
    };
  }, [registerCustomWorkbenchView, unregisterCustomWorkbenchView, t]);

  return useMemo(
    () => ({
      signRequestWorkbench: {
        id: SIGN_REQUEST_WORKBENCH_ID,
        type: SIGN_REQUEST_WORKBENCH_TYPE,
      },
      sessionDetailWorkbench: {
        id: SESSION_DETAIL_WORKBENCH_ID,
        type: SESSION_DETAIL_WORKBENCH_TYPE,
      },
    }),
    []
  );
};
