import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MultiSelect, Loader } from '@mantine/core';
import { alert } from '@app/components/toast';
import { UserSummary } from '@app/types/signingSession';
import apiClient from '@app/services/apiClient';
import { useAuth } from '@app/auth/UseSession';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';

interface UserSelectorProps {
  value: number[];
  onChange: (userIds: number[]) => void;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
}

type SelectItem = { value: string; label: string };
type GroupedData = { group: string; items: SelectItem[] };

const UserSelector = ({ value, onChange, placeholder, size = 'sm', disabled = false }: UserSelectorProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectData, setSelectData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stringValue, setStringValue] = useState<string[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/api/v1/user/users');
        console.log('Users API response:', response.data);
        const fetchedUsers = response.data || [];

        // Process selectData inside useEffect - group by team
        const usersByTeam: Record<string, SelectItem[]> = {};
        const currentUserId = user?.id ? parseInt(user.id, 10) : null;

        fetchedUsers
          .filter((u: UserSummary) => u && u.userId && u.username)
          .filter((u: UserSummary) => u.userId !== currentUserId) // Exclude current user
          .filter((u: UserSummary) => u.teamName?.toLowerCase() !== 'internal') // Exclude internal users
          .forEach((user: UserSummary) => {
            const teamName = user.teamName || t('certSign.collab.userSelector.noTeam', 'No Team');
            if (!usersByTeam[teamName]) {
              usersByTeam[teamName] = [];
            }
            usersByTeam[teamName].push({
              value: String(user.userId),
              label: `${user.displayName || user.username || 'Unknown'} (@${user.username || 'unknown'})`,
            });
          });

        // Convert to Mantine's grouped format
        const processed: GroupedData[] = Object.entries(usersByTeam).map(([teamName, items]) => ({
          group: teamName,
          items: items.sort((a, b) => a.label.localeCompare(b.label)),
        }));

        console.log('Processed selectData:', processed);
        setSelectData(processed);
      } catch (error) {
        console.error('Failed to load users:', error);
        alert({
          alertType: 'error',
          title: t('error'),
          body: t('certSign.collab.userSelector.loadError', 'Failed to load users'),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [t, user]);

  // Process stringValue when value prop changes
  useEffect(() => {
    const safeValue = Array.isArray(value) ? value : [];
    const result = safeValue.map((id) => (id != null ? id.toString() : '')).filter(Boolean);
    console.log('stringValue for MultiSelect:', result);
    setStringValue(result);
  }, [value]);

  if (loading) {
    return <Loader size="sm" />;
  }

  // Don't render if we don't have data ready
  if (!selectData || selectData.length === 0) {
    return <Loader size="sm" />;
  }

  return (
    <MultiSelect
      data={selectData}
      value={stringValue}
      onChange={(selectedIds) => {
        const parsedIds = selectedIds
          .map((id) => parseInt(id, 10))
          .filter((id) => !isNaN(id));
        onChange(parsedIds);
      }}
      placeholder={placeholder || t('certSign.collab.userSelector.placeholder', 'Select users...')}
      searchable
      clearable
      size={size}
      disabled={disabled}
      maxDropdownHeight={300}
      comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_FILE_MANAGER_MODAL + 10 }}
    />
  );
};

export default UserSelector;
