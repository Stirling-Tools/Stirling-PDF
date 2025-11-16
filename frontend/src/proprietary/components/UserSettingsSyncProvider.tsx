import { ReactNode } from 'react';
import { useUserSettingsSync } from '@app/hooks/useUserSettingsSync';

interface Props {
  children: ReactNode;
}

export function UserSettingsSyncProvider({ children }: Props) {
  useUserSettingsSync();
  return <>{children}</>;
}
