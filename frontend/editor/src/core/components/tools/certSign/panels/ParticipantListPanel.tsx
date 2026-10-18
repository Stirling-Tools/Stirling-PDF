import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Avatar } from "@app/ui/Avatar";
import { Icon } from "@app/ui/Icon";
import { StatusBadge } from "@app/ui/StatusBadge";
import type {
  ParticipantInfo,
  SigningParticipantPreview,
} from "@app/types/signingSession";
import { getFileColor } from "@app/utils/fileColors";
import "@app/components/shared/signing/signingDetail.css";

interface ParticipantListPanelProps {
  participants: (SigningParticipantPreview & { email?: string })[];
  finalized: boolean;
  onRemove?: (participantId: number) => void;
  disabled?: boolean;
}

export const ParticipantListPanel: React.FC<ParticipantListPanelProps> = ({
  participants,
  finalized,
  onRemove,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const statusLabels: Record<ParticipantInfo["status"], string> = {
    SIGNED: t("sharedSign.filterSigned", "Signed"),
    DECLINED: t("certSign.declined", "Declined"),
    VIEWED: t("certSign.viewed", "Viewed"),
    NOTIFIED: t("signingDetail.notified", "Notified"),
    PENDING: t("certSign.pending", "Pending"),
  };
  return (
    <ul
      className="signing-participants"
      aria-label={t(
        "certSign.collab.sessionDetail.participants",
        "Participants",
      )}
    >
      {participants.map((participant, participantIndex) => {
        const isSigned = participant.status === "SIGNED";
        const isDeclined = participant.status === "DECLINED";
        const name = participant.name || participant.email || "";
        return (
          <li className="signing-participant" key={participant.id}>
            <Avatar name={name} size="sm" tone="neutral" />
            <div className="signing-participant__identity">
              <strong>{name}</strong>
              {participant.email && participant.email !== name && (
                <span className="signing-participant__email">
                  {participant.email}
                </span>
              )}
              <StatusBadge
                tone={isSigned ? "success" : isDeclined ? "danger" : "neutral"}
                size="sm"
              >
                {statusLabels[participant.status]}
              </StatusBadge>
            </div>
            {participant.wetSignatures?.length ? (
              <span
                className="signing-participant__color"
                style={{ backgroundColor: getFileColor(participantIndex) }}
                aria-hidden="true"
              />
            ) : null}
            {onRemove && !finalized && !isSigned && !isDeclined && (
              <ActionIcon
                size="sm"
                variant="tertiary"
                accent="danger"
                disabled={disabled}
                onClick={() => onRemove(participant.id)}
                aria-label={t("signingDetail.removePerson", "Remove {{name}}", {
                  name,
                })}
              >
                <Icon name="x" size={16} />
              </ActionIcon>
            )}
          </li>
        );
      })}
    </ul>
  );
};
