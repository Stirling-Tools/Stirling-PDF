import { useState } from "react";
import { Collapse } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import { SigningParticipantPicker } from "@app/components/shared/signing/SigningParticipantPicker";
import SignatureSettingsInput, {
  type SignatureSettings,
} from "@app/components/tools/certSign/SignatureSettingsInput";
import type { FileState } from "@app/types/file";
import "@app/components/shared/signing/signing.css";

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
  const { t, i18n } = useTranslation();
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
    <div className="signing-request">
      <SigningParticipantPicker
        value={selectedUserIds}
        onChange={onSelectedUserIdsChange}
        disabled={creating}
      />
      <fieldset className="signing-request__calendar" disabled={creating}>
        <legend>
          {t("signMenu.dueDate", "Due date (optional)")}
          <Tooltip
            content={t(
              "signWorkspace.dueDateHelp",
              "This is a target date. Participants can still sign after it.",
            )}
          >
            <ActionIcon
              variant="quiet"
              aria-label={t(
                "signWorkspace.dueDateHelpLabel",
                "About due dates",
              )}
            >
              <Icon name="info" size={16} />
            </ActionIcon>
          </Tooltip>
        </legend>
        <div className="signing-request__date-value">
          <span aria-live="polite">
            {dueDate
              ? new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "long",
                }).format(new Date(`${dueDate}T12:00:00`))
              : t("signWorkspace.noDueDate", "No due date")}
          </span>
          {dueDate && (
            <Button
              variant="tertiary"
              disabled={creating}
              onClick={() => onDueDateChange("")}
            >
              {t("signWorkspace.clearDate", "Clear date")}
            </Button>
          )}
        </div>
        <DatePicker
          value={dueDate || null}
          onChange={(date) => {
            if (!creating) onDueDateChange(date ?? "");
          }}
          allowDeselect
          highlightToday
          size="md"
          maxLevel="month"
          nextLabel={t("signWorkspace.nextMonth", "Next month")}
          previousLabel={t("signWorkspace.previousMonth", "Previous month")}
          monthLabelFormat={(date) =>
            new Intl.DateTimeFormat(i18n.language, {
              month: "long",
              year: "numeric",
            }).format(new Date(`${date}T12:00:00`))
          }
          weekdayFormat={(date) =>
            new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(
              new Date(`${date}T12:00:00`),
            )
          }
          getDayAriaLabel={(date) =>
            new Intl.DateTimeFormat(i18n.language, {
              dateStyle: "full",
            }).format(new Date(`${date}T12:00:00`))
          }
          classNames={{
            month: "signing-request__month",
            day: "signing-request__day",
            calendarHeader: "signing-request__month-header",
          }}
        />
      </fieldset>
      <Button
        variant="tertiary"
        onClick={() => setShowSettings((shown) => !shown)}
        aria-expanded={showSettings}
        justify="between"
        rightSection={
          <Icon name={showSettings ? "chevron-up" : "chevron-down"} size={18} />
        }
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
      <Button
        size="md"
        fullWidth
        disabled={!file || selectedUserIds.length === 0 || creating}
        loading={creating}
        onClick={() => onSubmit(settings)}
      >
        {t("signMenu.send", "Send signing request")}
      </Button>
    </div>
  );
}
