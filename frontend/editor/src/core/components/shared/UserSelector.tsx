import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MultiSelect, Loader, Text, Stack, TextInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import styles from "@app/components/shared/UserSelector.module.css";
import { useNavigate } from "react-router-dom";
import { alert } from "@app/components/toast";
import { fetchUsers } from "@app/api/users";
import { useAuth } from "@app/auth/UseSession";
import { qk } from "@app/query/keys";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";

interface UserSelectorProps {
  value: number[];
  onChange: (userIds: number[]) => void;
  placeholder?: string;
  label?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
  presentation?: "dropdown" | "cards";
}

type SelectItem = { value: string; label: string };
type GroupedData = { group: string; items: SelectItem[] };

const UserSelector = ({
  value,
  onChange,
  placeholder,
  label,
  size = "sm",
  disabled = false,
  presentation = "dropdown",
}: UserSelectorProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stringValue, setStringValue] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const {
    data: users,
    isPending: loading,
    error,
  } = useQuery({ queryKey: qk.users(), queryFn: fetchUsers });

  useEffect(() => {
    if (!error) return;
    alert({
      alertType: "error",
      title: t("common.error"),
      body: t("certSign.collab.userSelector.loadError", "Failed to load users"),
    });
  }, [error, t]);

  const selectData = useMemo<GroupedData[]>(() => {
    const usersByTeam: Record<string, SelectItem[]> = {};
    const currentUserId = user?.id ? parseInt(user.id, 10) : null;

    (users ?? [])
      .filter((u) => u && u.userId && u.username)
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
        usersByTeam[teamName].push({
          value: String(u.userId),
          label:
            u.userId === currentUserId
              ? t("certSign.collab.userSelector.you", "{{name}} (You)", {
                  name: label,
                })
              : label,
        });
      });

    return Object.entries(usersByTeam).map(([teamName, items]) => ({
      group: teamName,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [users, user, t]);

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

  if (!selectData || selectData.length === 0) {
    return (
      <Stack gap="xs" align="flex-start">
        <Text size="sm" c="dimmed">
          {t("certSign.collab.userSelector.noUsers", "No other users found.")}
        </Text>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => navigate("/settings/people")}
        >
          {t("certSign.collab.userSelector.inviteUsers", "Add Users")}
        </Button>
      </Stack>
    );
  }

  if (presentation === "cards") {
    const matchingGroups = selectData
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.label} ${group.group}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
        ),
      }))
      .filter((group) => group.items.length > 0);
    return (
      <Stack gap="md" role="group" aria-label={label}>
        <TextInput
          aria-label={t(
            "signWorkspace.searchParticipants",
            "Search people or teams",
          )}
          placeholder={t(
            "signWorkspace.searchParticipants",
            "Search people or teams",
          )}
          leftSection={<Icon name="search" size={18} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          disabled={disabled}
        />
        <div className={styles.groups}>
          {matchingGroups.map((group) => (
            <div key={group.group}>
              {group.group.toLowerCase() !== "default" && (
                <Text size="xs" c="dimmed" mb="xs">
                  {group.group}
                </Text>
              )}
              <div className={styles.grid}>
                {group.items.map((item) => {
                  const id = Number(item.value);
                  const selected = value.includes(id);
                  return (
                    <label
                      key={id}
                      className={styles.card}
                      data-selected={selected}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {item.label.slice(0, 2).toLocaleUpperCase()}
                      </span>
                      <span className={styles.name}>{item.label}</span>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() =>
                          onChange(
                            selected
                              ? value.filter((userId) => userId !== id)
                              : [...value, id],
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {matchingGroups.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("signWorkspace.noPeopleMatch", "No people match your search.")}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <MultiSelect
      label={label}
      aria-label={
        label ??
        t("certSign.collab.userSelector.placeholder", "Select users...")
      }
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
