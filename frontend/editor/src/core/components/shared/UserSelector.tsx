import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MultiSelect, Loader, Text, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useNavigate } from "react-router-dom";
import { alert } from "@app/components/toast";
import { UserSummary } from "@app/types/signingSession";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { qk } from "@app/query/keys";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";

interface UserSelectorProps {
  value: number[];
  onChange: (userIds: number[]) => void;
  placeholder?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
}

type SelectItem = { value: string; label: string };
type GroupedData = { group: string; items: SelectItem[] };

async function fetchUsers(): Promise<UserSummary[]> {
  const response = await apiClient.get<UserSummary[]>("/api/v1/user/users");
  return response.data || [];
}

const UserSelector = ({
  value,
  onChange,
  placeholder,
  size = "sm",
  disabled = false,
}: UserSelectorProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stringValue, setStringValue] = useState<string[]>([]);

  // Shared across every mount site (participant pickers, the policy wizard),
  // so opening a second one reuses the roster instead of re-fetching it.
  const {
    data: users,
    isPending: loading,
    error,
  } = useQuery({ queryKey: qk.users(), queryFn: fetchUsers });

  useEffect(() => {
    if (!error) return;
    console.error("Failed to load users:", error);
    alert({
      alertType: "error",
      title: t("common.error"),
      body: t("certSign.collab.userSelector.loadError", "Failed to load users"),
    });
  }, [error, t]);

  // Group by team, dropping the current user and the internal team.
  const selectData = useMemo<GroupedData[]>(() => {
    const usersByTeam: Record<string, SelectItem[]> = {};
    const currentUserId = user?.id ? parseInt(user.id, 10) : null;

    (users ?? [])
      .filter((u) => u && u.userId && u.username)
      .filter((u) => u.userId !== currentUserId)
      .filter((u) => u.teamName?.toLowerCase() !== "internal")
      .forEach((u) => {
        const teamName =
          u.teamName || t("certSign.collab.userSelector.noTeam", "No Team");
        if (!usersByTeam[teamName]) {
          usersByTeam[teamName] = [];
        }
        const displayName = u.displayName || u.username || "Unknown";
        const username = u.username || "unknown";
        const label =
          displayName !== username
            ? `${displayName} (@${username})`
            : displayName;
        usersByTeam[teamName].push({ value: String(u.userId), label });
      });

    return Object.entries(usersByTeam).map(([teamName, items]) => ({
      group: teamName,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [users, user, t]);

  // Process stringValue when value prop changes
  useEffect(() => {
    const safeValue = Array.isArray(value) ? value : [];
    const result = safeValue
      .map((id) => (id != null ? id.toString() : ""))
      .filter(Boolean);
    setStringValue(result);
  }, [value]);

  if (loading) {
    return <Loader size="sm" />;
  }

  // No users available — prompt to invite
  if (!selectData || selectData.length === 0) {
    return (
      <Stack gap="xs" align="flex-start">
        <Text size="sm" c="dimmed">
          {t("certSign.collab.userSelector.noUsers", "No other users found.")}
        </Text>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate("/settings/people")}
        >
          {t("certSign.collab.userSelector.inviteUsers", "Add Users")}
        </Button>
      </Stack>
    );
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
      placeholder={
        placeholder ||
        t("certSign.collab.userSelector.placeholder", "Select users...")
      }
      searchable
      clearable
      size={size}
      disabled={disabled}
      maxDropdownHeight={300}
      comboboxProps={{
        withinPortal: true,
        zIndex: Z_INDEX_OVER_FILE_MANAGER_MODAL + 10,
      }}
    />
  );
};

export default UserSelector;
