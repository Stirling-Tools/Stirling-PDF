import { useEffect, useState } from 'react';
import { Avatar, Text } from '@mantine/core';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { accountService } from '@app/services/accountService';

interface LeftSidebarFooterProps {
  onSettingsClick: () => void;
  collapsed?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/[\s_@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function LeftSidebarFooter({ onSettingsClick, collapsed }: LeftSidebarFooterProps) {
  const { config } = useAppConfig();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (config?.enableLogin !== true) return;
    accountService.getAccountData()
      .then((data) => setUsername(data.username))
      .catch(() => {});
  }, [config?.enableLogin]);

  const shouldHideSettings = config?.enableLogin === false && config?.showSettingsWhenNoLogin === false;
  if (shouldHideSettings && !username) return null;

  const displayName = username ?? null;
  const initials = displayName ? getInitials(displayName) : null;

  return (
    <div className={`left-sidebar-footer${collapsed ? ' left-sidebar-footer-collapsed' : ''}`}>
      {displayName ? (
        <button
          className="left-sidebar-footer-user"
          onClick={onSettingsClick}
          title="Open settings"
        >
          <Avatar size={28} radius="xl" color="orange" className="left-sidebar-footer-avatar">
            {initials}
          </Avatar>
          {!collapsed && (
            <span className="left-sidebar-footer-info">
              <Text size="xs" fw={500} className="left-sidebar-footer-username" truncate>
                {displayName}
              </Text>
            </span>
          )}
        </button>
      ) : (
        null
      )}
    </div>
  );
}
