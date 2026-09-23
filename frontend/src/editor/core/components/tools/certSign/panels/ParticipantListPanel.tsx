import { Stack, Text, List, Group, Badge } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import type { ParticipantInfo } from "@app/types/signingSession";
import { getFileColor } from "@app/components/pageEditor/fileColors";

interface ParticipantListPanelProps {
  participants: ParticipantInfo[];
  finalized: boolean;
  onRemove: (participantId: number) => void;
}

export const ParticipantListPanel: React.FC<ParticipantListPanelProps> = ({
  participants,
  finalized,
  onRemove,
}) => {
  const { t } = useTranslation();

  const getIcon = (status: string) => {
    if (status === "SIGNED")
      return (
        <Icon name="circle-check" size={"1rem"} style={{ color: "green" }} />
      );
    if (status === "DECLINED")
      return <Icon name="circle-x" size={"1rem"} style={{ color: "red" }} />;
    return <Icon name="clock" size={"1rem"} style={{ color: "orange" }} />;
  };

  const getColor = (status: string) => {
    if (status === "SIGNED") return "green";
    if (status === "DECLINED") return "red";
    return "orange";
  };

  return (
    <Stack gap="md">
      <Text size="md" fw={600}>
        {t("certSign.collab.sessionDetail.participants", "Participants")}
      </Text>

      <List spacing={8} size="sm">
        {participants.map((participant, participantIndex) => {
          const isSigned = participant.status === "SIGNED";
          const isDeclined = participant.status === "DECLINED";
          const annotationColor = getFileColor(participantIndex);

          return (
            <List.Item key={participant.id} icon={getIcon(participant.status)}>
              <Group justify="space-between" wrap="nowrap" gap={4}>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: annotationColor,
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs" truncate>
                      {participant.name}
                    </Text>
                  </Group>
                  {participant.email &&
                    participant.email !== participant.name && (
                      <Text size="xs" c="dimmed" truncate>
                        @{participant.email}
                      </Text>
                    )}
                  <Badge
                    size="xs"
                    color={getColor(participant.status)}
                    variant="light"
                  >
                    {t(
                      `certSign.collab.status.${participant.status.toLowerCase()}`,
                      participant.status,
                    )}
                  </Badge>
                </Stack>
                {!finalized && !isSigned && !isDeclined && (
                  <ActionIcon
                    size="sm"
                    variant="tertiary"
                    accent="danger"
                    onClick={() => onRemove(participant.id)}
                    title={t(
                      "certSign.collab.sessionDetail.removeParticipant",
                      "Remove",
                    )}
                    aria-label={t(
                      "certSign.collab.sessionDetail.removeParticipant",
                      "Remove",
                    )}
                  >
                    <Icon name="trash" size={"1rem"} />
                  </ActionIcon>
                )}
              </Group>
            </List.Item>
          );
        })}
      </List>
    </Stack>
  );
};
