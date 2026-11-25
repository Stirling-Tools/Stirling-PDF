import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { FormField } from "@editor/ui/FormField";
import { Icon } from "@editor/ui/Icon";
import { Input } from "@editor/ui/Input";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@editor/ui/SegmentedControl";
import type {
  SetupStepId,
  ErrorCode,
  ServerSetupDraft,
  SetupMode,
  StepErrors,
} from "@editor/components/serverSetup/serverSetupDraft";
import { Z_INDEX_ONBOARDING_CARD } from "@editor/styles/zIndex";
import styles from "@editor/components/shared/setupCard/SetupCard.module.css";

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

function isSectionOn(
  draft: ServerSetupDraft,
): Record<ExpandableSection, boolean> {
  return {
    signIn: draft.login !== "password",
    email: draft.emailEnabled,
    ai: draft.ai === "custom",
    documents: draft.ai === "custom" && draft.documentQuestions,
  };
}

/** The step whose card holds each section. */
const STEP_OF_SECTION: Record<ExpandableSection, SetupStepId> = {
  signIn: "signIn",
  email: "email",
  ai: "ai",
  documents: "ai",
};

/** The sections on `step` that are shown and switched on, and so have fields
 *  to fill in; a configured step's sections are not on the card at all. */
function sectionsOn(
  step: SetupStepId,
  draft: ServerSetupDraft,
  configuredSteps: ReadonlySet<SetupStepId>,
): ExpandableSection[] {
  const isOn = isSectionOn(draft);
  return (SECTIONS_BY_STEP[step] ?? []).filter(
    (section) =>
      isOn[section] && !configuredSteps.has(STEP_OF_SECTION[section]),
  );
}

/** Sections the server already has switched on, so already configured. */
export function sectionsConfiguredOnServer(
  initial: ServerSetupDraft,
): Set<ExpandableSection> {
  const isOn = isSectionOn(initial);
  return new Set(
    (Object.keys(isOn) as ExpandableSection[]).filter(
      (section) => isOn[section],
    ),
  );
}

/** The section to open when a card first shows: its first one switched on. */
export function initialOpenSection(
  step: SetupStepId,
  draft: ServerSetupDraft,
  configuredSteps: ReadonlySet<SetupStepId> = new Set(),
): ExpandableSection | null {
  return sectionsOn(step, draft, configuredSteps)[0] ?? null;
}

/** The section Save moves on to: the next one switched on below `current`, if any. */
export function nextOpenSection(
  step: SetupStepId,
  draft: ServerSetupDraft,
  current: ExpandableSection,
  configuredSteps: ReadonlySet<SetupStepId> = new Set(),
): ExpandableSection | null {
  const order = SECTIONS_BY_STEP[step] ?? [];
  return (
    sectionsOn(step, draft, configuredSteps).find(
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
  /** Sections the server had on, or that were shut while on; they read Configured. */
  configured: ReadonlySet<ExpandableSection>;
  /** Steps the server already has settings for; their fields are not shown. */
  configuredSteps: ReadonlySet<SetupStepId>;
  /** Checks `section`'s fields; when they pass, opens the next section switched on. */
  saveSection: (section: ExpandableSection) => void;
}

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Scrolls the card just enough to show `group` (or its top, if taller) below
 *  the sticky bar holding Back and the step count. */
function revealInCard(group: HTMLElement) {
  const scroller = group.closest<HTMLElement>(`.${styles.frameScroll}`);
  if (!scroller) return;
  const sticky =
    scroller.querySelector<HTMLElement>(`.${styles.topBar}`)?.offsetHeight ?? 0;
  const view = scroller.getBoundingClientRect();
  const box = group.getBoundingClientRect();
  const belowView = box.bottom - view.bottom;
  const aboveView = box.top - (view.top + sticky);
  const delta =
    aboveView < 0 ? aboveView : Math.min(Math.max(belowView, 0), aboveView);
  if (delta === 0) return;
  scroller.scrollBy({
    top: delta,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/** A setting's label and control, plus any `details` it opens in an animated
 *  panel; boxed whenever it has `details`, so those fields read as its own. */
export function SettingRow({
  label,
  children,
  expand,
  chevron = false,
  details,
}: {
  label: string;
  children: (labelId: string) => ReactNode;
  /** Shows `details` with a Save button while open. The control opens and
   *  shuts it, unless `chevron`. */
  expand?: SectionExpand;
  /** Adds a chevron that opens and shuts `details`, for a control that cannot. */
  chevron?: boolean;
  details?: ReactNode;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const detailsId = useId();
  const open = expand?.open === true;
  const groupRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  // Scrolled once fully open (at once without motion), when the card has grown;
  // not on mount, where a card that opens with it showing is at its top.
  useEffect(() => {
    const opened = open && !wasOpen.current;
    wasOpen.current = open;
    if (opened && prefersReducedMotion() && groupRef.current) {
      revealInCard(groupRef.current);
    }
  }, [open]);
  const revealWhenOpened = (event: TransitionEvent<HTMLDivElement>) => {
    if (open && event.target === event.currentTarget && groupRef.current) {
      revealInCard(groupRef.current);
    }
  };

  return (
    <div
      ref={groupRef}
      className={styles.group}
      data-expandable={details !== undefined}
      role="group"
      aria-labelledby={labelId}
    >
      <div className={styles.groupRow}>
        <span className={styles.settingLabel} id={labelId}>
          {label}
        </span>
        <div className={styles.settingControl}>{children(labelId)}</div>
        {expand && chevron && (
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
          onTransitionEnd={revealWhenOpened}
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

/** A set of fields with no controlling setting, such as the addresses. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <div className={styles.group}>
      <div className={styles.groupFields}>{children}</div>
    </div>
  );
}

export interface SectionExpand {
  open: boolean;
  configured: boolean;
  onToggle: () => void;
  onSave: () => void;
}

/** The `expand` prop for a SettingRow whose fields live in `section`. */
export function sectionToggle(
  props: Pick<
    SetupStepProps,
    "openSection" | "setOpenSection" | "saveSection" | "configured"
  >,
  section: ExpandableSection,
): SectionExpand {
  const open = props.openSection === section;
  return {
    open,
    configured: props.configured.has(section),
    onToggle: () => props.setOpenSection(open ? null : section),
    onSave: () => props.saveSection(section),
  };
}

/** A segmented choice whose `expandValue` segment also opens and shuts the
 *  setting's fields; it reads Configured once they have been shut. */
export function SetupChoice<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  expand,
  expandValue,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  expand?: SectionExpand;
  expandValue?: T;
}) {
  const { t } = useTranslation();
  const toggles = expand !== undefined && value === expandValue;
  const isExpandRadio = (target: EventTarget) =>
    toggles &&
    target instanceof HTMLInputElement &&
    target.value === expandValue;
  // A click on the label reaches the radio as a click too, so handling the
  // radio's alone toggles once. A chosen radio gets no click from the keyboard.
  const toggleOnClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isExpandRadio(event.target)) expand?.onToggle();
  };
  const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key === " " || event.key === "Enter") &&
      isExpandRadio(event.target)
    ) {
      event.preventDefault();
      expand?.onToggle();
    }
  };
  const shown = options.map((option) =>
    toggles && option.value === expandValue
      ? {
          ...option,
          label: (
            <span className={styles.expandLabel}>
              <span className={styles.expandLabelText}>
                {expand.open && !expand.configured
                  ? option.label
                  : t("serverSetup.configured", "Configured")}
              </span>
              <Icon
                name={expand.open ? "chevron-up" : "chevron-down"}
                size={14}
              />
            </span>
          ),
        }
      : option,
  );
  return (
    <div
      className={styles.setupChoice}
      onClick={toggleOnClick}
      onKeyDown={toggleOnKey}
    >
      <SegmentedControl
        fullWidth
        ariaLabel={ariaLabel}
        value={value}
        onChange={onChange}
        options={shown}
      />
    </div>
  );
}

export function OnOffControl({
  value,
  onChange,
  ariaLabel,
  expand,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  expand?: SectionExpand;
}) {
  const { t } = useTranslation();
  return (
    <SetupChoice
      ariaLabel={ariaLabel}
      value={value ? "on" : "off"}
      onChange={(next) => onChange(next === "on")}
      expand={expand}
      expandValue="on"
      options={[
        { value: "off", label: t("serverSetup.off", "Off") },
        { value: "on", label: t("serverSetup.on", "On") },
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
  initialFocus,
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
  /** Takes focus when the dialog opens; otherwise it focuses the first
   *  focusable, which may be an (i) whose tooltip opens on focus. */
  initialFocus?: boolean;
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
        data-autofocus={initialFocus || undefined}
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
