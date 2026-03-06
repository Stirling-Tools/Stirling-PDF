import { useEffect, useRef } from 'react';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { SmartFolderWorkbenchView } from '@app/components/smartFolders/SmartFolderWorkbenchView';
import { seedDefaultFolders } from '@app/data/smartFolderPresets';

export const SMART_FOLDER_VIEW_ID = 'smartFolder';
export const SMART_FOLDER_WORKBENCH_ID = 'custom:smartFolder' as const;

export default function SmartFoldersRegistration() {
  const { registerCustomWorkbenchView, unregisterCustomWorkbenchView, clearCustomWorkbenchViewData } = useToolWorkflow();

  // Keep refs to latest cleanup callbacks so the registration effect doesn't
  // re-run (and tear down) when unregisterCustomWorkbenchView changes identity
  // due to NavigationContext re-renders.
  const unregisterRef = useRef(unregisterCustomWorkbenchView);
  const clearRef = useRef(clearCustomWorkbenchViewData);
  useEffect(() => { unregisterRef.current = unregisterCustomWorkbenchView; });
  useEffect(() => { clearRef.current = clearCustomWorkbenchViewData; });

  useEffect(() => {
    seedDefaultFolders();
  }, []);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: SMART_FOLDER_VIEW_ID,
      workbenchId: SMART_FOLDER_WORKBENCH_ID,
      label: 'Watch Folders',
      component: SmartFolderWorkbenchView,
    });
    return () => {
      clearRef.current(SMART_FOLDER_VIEW_ID);
      unregisterRef.current(SMART_FOLDER_VIEW_ID);
    };
  }, [registerCustomWorkbenchView]);

  return null;
}
