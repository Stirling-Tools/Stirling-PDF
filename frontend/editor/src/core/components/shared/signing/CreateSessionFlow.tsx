import { useEffect, useRef, useState, type ReactNode } from "react";
import { Collapse } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import { SigningParticipantPicker } from "@app/components/shared/signing/SigningParticipantPicker";
import { useIsMobile } from "@app/hooks/useIsMobile";
import SignatureSettingsInput, {
  type SignatureSettings,
} from "@app/components/tools/certSign/SignatureSettingsInput";
import type { FileState } from "@app/types/file";
import "@app/components/shared/signing/signing.css";

interface CreateSessionFlowProps {
  documentPicker: ReactNode;
  selectedFiles: FileState[];
  selectedUserIds: number[];
  onSelectedUserIdsChange: (userIds: number[]) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  creating: boolean;
  onSubmit: (signatureSettings: SignatureSettings) => void;
}

export function CreateSessionFlow({
  documentPicker,
  selectedFiles,
  selectedUserIds,
  onSelectedUserIdsChange,
  dueDate,
  onDueDateChange,
  creating,
  onSubmit,
}: CreateSessionFlowProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const stepsRef = useRef<HTMLElement>(null);
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
  const activeStep = !file
    ? 0
    : selectedUserIds.length === 0 && step === 2
      ? 1
      : step;
  const stepLabels = [
    t("signWorkspace.document", "Document"),
    t("signWorkspace.participants", "Participants"),
    t("signWorkspace.datesAndOptions", "Dates & options"),
  ];
  useEffect(() => {
    setStep(activeStep);
    if (isMobile) stepsRef.current?.focus();
  }, [activeStep, isMobile]);
  const sendButton = (
    <Button
      size="md"
      fullWidth
      disabled={!file || selectedUserIds.length === 0 || creating}
      loading={creating}
      onClick={() => onSubmit(settings)}
    >
      {t("signMenu.send", "Send signing request")}
    </Button>
  );
  return (
    <div
      className="signing-workspace__create"
      data-mobile={isMobile || undefined}
    >
      {isMobile && (
        <nav
          className="signing-request__steps"
          aria-label={t("signWorkspace.requestSteps", "Signing request steps")}
          ref={stepsRef}
          tabIndex={-1}
        >
          <ol>
            {stepLabels.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={activeStep === index ? "step" : undefined}
                  disabled={
                    creating ||
                    (index > 0 && !file) ||
                    (index > 1 && selectedUserIds.length === 0)
                  }
                  onClick={() => setStep(index)}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div
        className="signing-request__document"
        hidden={isMobile && activeStep !== 0}
      >
        {documentPicker}
      </div>
      <div className="signing-request" hidden={isMobile && activeStep === 0}>
        <div hidden={isMobile && activeStep !== 1}>
          <SigningParticipantPicker
            value={selectedUserIds}
            onChange={onSelectedUserIdsChange}
            disabled={creating}
          />
        </div>
        <div
          className="signing-request__options"
          hidden={isMobile && activeStep !== 2}
        >
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
                new Intl.DateTimeFormat(i18n.language, {
                  weekday: "short",
                }).format(new Date(`${date}T12:00:00`))
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
              <Icon
                name={showSettings ? "chevron-up" : "chevron-down"}
                size={18}
              />
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
        </div>
        {!isMobile && sendButton}
      </div>
      {isMobile && (
        <div className="signing-request__step-actions">
          {activeStep > 0 && (
            <Button
              size="md"
              variant="secondary"
              disabled={creating}
              onClick={() => setStep(activeStep - 1)}
            >
              {t("back", "Back")}
            </Button>
          )}
          {activeStep === 2 ? (
            sendButton
          ) : (
            <Button
              size="md"
              fullWidth
              disabled={
                creating ||
                (activeStep === 0 ? !file : selectedUserIds.length === 0)
              }
              onClick={() => setStep(activeStep + 1)}
              rightSection={<Icon name="arrow-right" size={18} />}
            >
              {t("signWorkspace.nextStep", "Next")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
