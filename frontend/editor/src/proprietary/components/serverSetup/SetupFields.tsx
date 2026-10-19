import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { FormField } from "@app/ui/FormField";
import { Icon } from "@app/ui/Icon";
import { Input } from "@app/ui/Input";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import type {
  SetupStepId,
  ErrorCode,
  ServerSetupDraft,
  SetupMode,
  StepErrors,
} from "@app/components/serverSetup/serverSetupDraft";
import { Z_INDEX_ONBOARDING_CARD } from "@app/styles/zIndex";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

/** Select dropdowns portal to the body, so they must sit above the setup screen. */
export const SETUP_DROPDOWN = { zIndex: Z_INDEX_ONBOARDING_CARD + 1 };

/** Settings that open more fields when switched on; one is open at a time. */
export type ExpandableSection = "signIn" | "email" | "ai" | "documents";

/** Each card's expandable settings, top to bottom. */
const SECTIONS_BY_STEP: Partial<Record<SetupStepId, ExpandableSection[]>> = {
  summary: ["signIn", "email", "ai", "documents"],
  signIn: ["signIn"],
  email: ["email"],
  ai: ["ai", "documents"],
};

/** The sections on `step` that are switched on, and so have fields to fill in. */
function sectionsOn(
  step: SetupStepId,
  draft: ServerSetupDraft,
): ExpandableSection[] {
  const isOn: Record<ExpandableSection, boolean> = {
    signIn: draft.login !== "password",
    email: draft.emailEnabled,
    ai: draft.ai === "custom",
    documents: draft.ai === "custom" && draft.documentQuestions,
  };
  return (SECTIONS_BY_STEP[step] ?? []).filter((section) => isOn[section]);
}

/** The section to open when a card first shows: its first one switched on. */
export function initialOpenSection(
  step: SetupStepId,
  draft: ServerSetupDraft,
): ExpandableSection | null {
  return sectionsOn(step, draft)[0] ?? null;
}

/** The section Save moves on to: the next one switched on below `current`, if any. */
export function nextOpenSection(
  step: SetupStepId,
  draft: ServerSetupDraft,
  current: ExpandableSection,
): ExpandableSection | null {
  const order = SECTIONS_BY_STEP[step] ?? [];
  return (
    sectionsOn(step, draft).find(
      (section) => order.indexOf(section) > order.indexOf(current),
    ) ?? null
  );
}

/** The section that holds a field, so an error there can open it. */
export function sectionForField(
  field: keyof ServerSetupDraft,
): ExpandableSection | null {
  if (field.startsWith("oauth")) return "signIn";
  if (field.startsWith("smtp")) return "email";
  if (field.startsWith("embedding")) return "documents";
  if (field.startsWith("ai")) return "ai";
  return null;
}

export interface SetupStepProps {
  draft: ServerSetupDraft;
  /** The server's values when the wizard opened. */
  initial: ServerSetupDraft;
  update: (patch: Partial<ServerSetupDraft>) => void;
  errors: StepErrors;
  mode: SetupMode;
  /** The admin signed in with the default password, so it need not be asked for. */
  usingDefaultCredentials: boolean;
  openSection: ExpandableSection | null;
  setOpenSection: (section: ExpandableSection | null) => void;
  /** Checks `section`'s fields; when they pass, opens the next section switched on. */
  saveSection: (section: ExpandableSection) => void;
}

/**
 * One setting as a rounded group: its label and control, then, for settings
 * that open more fields, those fields in a panel that animates open and shut.
 * `details` stays mounted while closed so it can animate; `inert` keeps its
 * fields out of the tab order meanwhile.
 */
export function SettingRow({
  label,
  children,
  expand,
  details,
}: {
  label: string;
  children: (labelId: string) => ReactNode;
  /**
   * Adds a chevron that shows or hides `details`, and a Save button under
   * them; omit while there is nothing to show.
   */
  expand?: { open: boolean; onToggle: () => void; onSave: () => void };
  details?: ReactNode;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const detailsId = useId();
  const open = expand?.open === true;
  return (
    <div className={styles.group} role="group" aria-labelledby={labelId}>
      <div className={styles.groupRow}>
        <span className={styles.settingLabel} id={labelId}>
          {label}
        </span>
        <div className={styles.settingControl}>{children(labelId)}</div>
        {expand && (
          <button
            type="button"
            className={styles.expandToggle}
            data-open={expand.open}
            aria-expanded={expand.open}
            aria-controls={details ? detailsId : undefined}
            aria-label={
              expand.open
                ? t("serverSetup.collapse", "Hide {{setting}} settings", {
                    setting: label,
                  })
                : t("serverSetup.expand", "Show {{setting}} settings", {
                    setting: label,
                  })
            }
            onClick={expand.onToggle}
          >
            <Icon name="chevron-down" size={16} />
          </button>
        )}
      </div>
      {details && (
        <div
          id={detailsId}
          className={styles.groupDetails}
          data-open={open}
          inert={!open}
        >
          <div className={styles.groupDetailsClip}>
            <div className={styles.groupDetailsBody}>
              {details}
              {expand && (
                <div className={styles.groupDetailsActions}>
                  <Button variant="secondary" size="sm" onClick={expand.onSave}>
                    {t("serverSetup.save", "Save")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A rounded group of fields with no controlling setting, such as the addresses. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <div className={styles.group}>
      <div className={styles.groupFields}>{children}</div>
    </div>
  );
}

/** The `expand` prop for a SettingRow whose fields live in `section`. */
export function sectionToggle(
  props: Pick<SetupStepProps, "openSection" | "setOpenSection" | "saveSection">,
  section: ExpandableSection,
) {
  const open = props.openSection === section;
  return {
    open,
    onToggle: () => props.setOpenSection(open ? null : section),
    onSave: () => props.saveSection(section),
  };
}

export function OnOffControl({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      fullWidth
      ariaLabel={ariaLabel}
      value={value ? "on" : "off"}
      onChange={(next) => onChange(next === "on")}
      options={[
        { value: "on", label: t("serverSetup.on", "On") },
        { value: "off", label: t("serverSetup.off", "Off") },
      ]}
    />
  );
}

function useErrorText() {
  const { t } = useTranslation();
  return (code: ErrorCode | undefined) => {
    switch (code) {
      case "required":
        return t("serverSetup.error.required", "Required");
      case "url":
        return t(
          "serverSetup.error.url",
          "Enter a full address, starting with http:// or https://",
        );
      case "port":
        return t("serverSetup.error.port", "Enter a port from 1 to 65535");
      case "email":
        return t("serverSetup.error.email", "Enter an email address");
      case "passwordLength":
        return t(
          "serverSetup.error.passwordLength",
          "Use at least 8 characters",
        );
      case "passwordMismatch":
        return t("serverSetup.error.passwordMismatch", "Passwords don't match");
      case "passwordUnchanged":
        return t(
          "serverSetup.error.passwordUnchanged",
          "Choose a password different from the current one",
        );
      case "passwordIncorrect":
        return t("serverSetup.error.passwordIncorrect", "Incorrect password");
      case "issuerUnreachable":
        return t(
          "serverSetup.error.issuerUnreachable",
          "Couldn't reach this issuer. Check the address, and that this server can reach it.",
        );
      case "providerName":
        return t(
          "serverSetup.error.providerName",
          "Use letters, numbers, dashes or underscores only",
        );
      case "username":
        return t(
          "serverSetup.error.username",
          "Use 3 to 50 letters, numbers or . _ + - @, or an email address",
        );
      case "usernameTaken":
        return t("serverSetup.error.usernameTaken", "That username is taken");
      case "passwordRejected":
        return t(
          "serverSetup.error.passwordRejected",
          "The server didn't accept this password. Try another.",
        );
      default:
        return undefined;
    }
  };
}

export function TextField({
  label,
  value,
  onChange,
  error,
  info,
  type = "text",
  placeholder,
  required,
  autoComplete = "off",
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: ErrorCode;
  /** Explanation behind an (i) beside the label. */
  info?: string;
  type?: "text" | "password" | "url" | "email";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const errorText = useErrorText();
  return (
    <FormField
      label={label}
      info={info}
      infoBeforeLabel
      infoZIndex={SETUP_DROPDOWN.zIndex}
      error={errorText(error)}
      required={required}
    >
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

export function SetupNote({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div
      className={[styles.note, tone === "warning" ? styles.noteWarning : ""]
        .filter(Boolean)
        .join(" ")}
      role={tone === "warning" ? "alert" : undefined}
    >
      <Icon
        name={tone === "warning" ? "triangle-alert" : "info"}
        size={16}
        className={styles.noteIcon}
      />
      <div className={styles.noteBody}>{children}</div>
    </div>
  );
}
