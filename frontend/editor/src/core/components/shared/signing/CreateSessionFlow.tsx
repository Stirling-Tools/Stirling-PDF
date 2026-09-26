import { useState } from "react";
import { Collapse, Group, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import UserSelector from "@app/components/shared/UserSelector";
import SignatureSettingsInput, {
  type SignatureSettings,
} from "@app/components/tools/certSign/SignatureSettingsInput";
import type { FileState } from "@app/types/file";

interface CreateSessionFlowProps {
  selectedFiles: FileState[];
  selectedUserIds: number[];
  onSelectedUserIdsChange: (userIds: number[]) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  creating: boolean;
  onSubmit: (signatureSettings: SignatureSettings) => void;
}

export function CreateSessionFlow({
  selectedFiles,
  selectedUserIds,
  onSelectedUserIdsChange,
  dueDate,
  onDueDateChange,
  creating,
  onSubmit,
}: CreateSessionFlowProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SignatureSettings>({
    showSignature: false,
    pageNumber: 1,
    reason: "",
    location: "",
    showLogo: false,
    includeSummaryPage: false,
  });
  const file = selectedFiles.length === 1 ? selectedFiles[0] : null;
  return (
    <Stack gap="md">
      <Text fw={600}>{t("signMenu.request", "Request signatures")}</Text>
      <Text size="sm" style={{ overflowWrap: "anywhere" }}>
        {file?.name ??
          t(
            "groupSigning.steps.selectDocument.noFile",
            "Please select a single PDF file from your active files to create a signing session.",
          )}
      </Text>
      <Text size="sm">
        {t(
          "groupSigning.steps.selectParticipants.label",
          "Select participants",
        )}
      </Text>
      <UserSelector
        value={selectedUserIds}
        onChange={onSelectedUserIdsChange}
        disabled={creating}
      />
      <Text size="xs" c="dimmed">
        {t(
          "signMenu.anyOrder",
          "Participants can sign in any order. The owner finalizes the document after reviewing the collected signatures.",
        )}
      </Text>
      <TextInput
        type="date"
        label={t("signMenu.dueDate", "Due date (optional)")}
        value={dueDate}
        onChange={(event) => onDueDateChange(event.currentTarget.value)}
        disabled={creating}
      />
      <Button
        variant="tertiary"
        onClick={() => setShowSettings((shown) => !shown)}
        aria-expanded={showSettings}
      >
        {t("signMenu.settings", "Appearance and summary page (optional)")}
      </Button>
      <Collapse in={showSettings}>
        <SignatureSettingsInput
          value={settings}
          onChange={setSettings}
          disabled={creating}
        />
      </Collapse>
      <Group grow>
        <Button
          disabled={!file || selectedUserIds.length === 0 || creating}
          loading={creating}
          onClick={() => onSubmit(settings)}
        >
          {t("signMenu.send", "Send signing request")}
        </Button>
      </Group>
    </Stack>
  );
}
