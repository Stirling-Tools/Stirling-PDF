import { useNavigationState } from '@app/contexts/NavigationContext';

const SMART_FOLDER_WORKBENCH_ID = 'custom:smartFolder';

export function useSmartFolderSidebar() {
  const { workbench } = useNavigationState();
  return { isActive: workbench === SMART_FOLDER_WORKBENCH_ID };
}
