import { Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import UserSelector from "@app/components/shared/UserSelector";

/** Updates the request's participants directly; sending the request is the commit point. */
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
        <span className="signing-request__selection-count" role="status">
          {t("signWorkspace.participantsSelected", "{{count}} selected", {
            count: value.length,
          })}
        </span>
      </div>
      <UserSelector
        presentation="cards"
        label={t("signWorkspace.chooseParticipants", "Choose participants")}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </section>
  );
}
