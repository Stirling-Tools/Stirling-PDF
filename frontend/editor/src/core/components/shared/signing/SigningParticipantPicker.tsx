import { useState } from "react";
import { Group, Modal } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchUsers } from "@app/api/users";
import { qk } from "@app/query/keys";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import UserSelector from "@app/components/shared/UserSelector";
import { Z_INDEX_FILE_MANAGER_MODAL } from "@app/styles/zIndex";

/** Participant changes stay tentative until the picker is applied. */
export function SigningParticipantPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { data: users } = useQuery({
    queryKey: qk.users(),
    queryFn: fetchUsers,
  });
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const choose = () => {
    setDraft(value);
    setOpened(true);
  };
  const chooseLabel = t(
    "signWorkspace.chooseParticipants",
    "Choose participants",
  );
  return (
    <section className="signing-request__participants">
      <div className="signing-request__heading">
        <Group gap="xs">
          <h2>{t("signWorkspace.participants", "Participants")}</h2>
          <Tooltip
            content={t(
              "signMenu.anyOrder",
              "Participants can sign in any order. The owner finalizes the document after reviewing the collected signatures.",
            )}
          >
            <ActionIcon
              variant="quiet"
              aria-label={t(
                "signWorkspace.signingOrderHelp",
                "About signing order",
              )}
            >
              <Icon name="info" size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {value.length > 0 && (
          <Button
            variant="secondary"
            onClick={choose}
            disabled={disabled}
            leftSection={<Icon name="users" size={18} />}
          >
            {chooseLabel}
          </Button>
        )}
      </div>
      {value.length === 0 ? (
        <button
          type="button"
          className="signing-request__add-people"
          onClick={choose}
          disabled={disabled}
        >
          <Icon name="users" size={32} />
          <span>{chooseLabel}</span>
          <Icon name="plus" size={20} />
        </button>
      ) : (
        <ul className="signing-request__people">
          {value.map((id) => {
            const user = users?.find((entry) => entry.userId === id);
            const name =
              user?.displayName ||
              user?.username ||
              t("signWorkspace.participantId", "Participant {{id}}", { id });
            return (
              <li key={id} className="signing-request__person">
                <span className="signing-request__avatar" aria-hidden="true">
                  {name.slice(0, 2).toLocaleUpperCase()}
                </span>
                <span className="signing-request__person-name">{name}</span>
                <ActionIcon
                  variant="quiet"
                  disabled={disabled}
                  aria-label={t(
                    "signWorkspace.removeParticipant",
                    "Remove {{name}}",
                    { name },
                  )}
                  onClick={() =>
                    onChange(value.filter((entry) => entry !== id))
                  }
                >
                  <Icon name="x" size={16} />
                </ActionIcon>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={chooseLabel}
        size="lg"
        centered
        zIndex={Z_INDEX_FILE_MANAGER_MODAL}
      >
        {opened && (
          <UserSelector
            presentation="cards"
            label={chooseLabel}
            value={draft}
            onChange={setDraft}
            disabled={disabled}
          />
        )}
        <Group justify="flex-end" mt="lg">
          <Button variant="secondary" onClick={() => setOpened(false)}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              onChange(draft);
              setOpened(false);
            }}
          >
            {t("signWorkspace.applyParticipants", "Use selected participants")}
          </Button>
        </Group>
      </Modal>
    </section>
  );
}
