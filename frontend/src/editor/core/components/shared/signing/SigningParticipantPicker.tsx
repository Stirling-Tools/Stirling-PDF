import { Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import UserSelector from "@app/components/shared/UserSelector";
import { GuestSignerInput } from "@app/components/shared/signing/GuestSignerInput";

/** Updates the request's participants directly; sending the request is the commit point. */
export function SigningParticipantPicker({
  value,
  onChange,
  guestEmails,
  onGuestEmailsChange,
  disabled,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  guestEmails: string[];
  onGuestEmailsChange: (emails: string[]) => void;
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
            count: value.length + guestEmails.length,
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
      <GuestSignerInput
        value={guestEmails}
        onChange={onGuestEmailsChange}
        disabled={disabled}
      />
    </section>
  );
}
