import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { withBasePath } from "@app/constants/app";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";
import {
  SettingRow,
  SetupNote,
  initialOpenSection,
  nextOpenSection,
  sectionForField,
  type ExpandableSection,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";
import { SetupStepFrame } from "@app/components/serverSetup/SetupStepFrame";
import {
  SetupScreen,
  SetupSignInScreen,
} from "@app/components/serverSetup/SetupScreen";
import {
  clearSetupSignIn,
  isSetupSignInPending,
} from "@app/components/serverSetup/setupSignInHandoff";
import {
  PasswordChangeError,
  SignInAgainError,
  UsernameChangeError,
  useSetupFinish,
} from "@app/components/serverSetup/useSetupFinish";
import { useAuth } from "@app/auth/UseSession";
import { DEFAULT_ADMIN_CREDENTIALS } from "@app/auth/defaultCredentials";
import {
  checkIssuer,
  fetchServerSettings,
  markSetupComplete,
} from "@app/components/serverSetup/serverSetupApi";
import {
  draftFromSettings,
  draftToSave,
  issuersToCheck,
  prefillAddresses,
  stepsFor,
  validateStep,
  type ServerSetupDraft,
  type SetupMode,
  type SetupStepId,
  type StepErrors,
} from "@app/components/serverSetup/serverSetupDraft";
import { AddressesStep } from "@app/components/serverSetup/steps/AddressesStep";
import { LanguageStep } from "@app/components/serverSetup/steps/LanguageStep";
import { SignInStep } from "@app/components/serverSetup/steps/SignInStep";
import { EmailStep } from "@app/components/serverSetup/steps/EmailStep";
import { FilesStep } from "@app/components/serverSetup/steps/FilesStep";
import { AiStep } from "@app/components/serverSetup/steps/AiStep";
import { AnalyticsStep } from "@app/components/serverSetup/steps/AnalyticsStep";
import { PasswordStep } from "@app/components/serverSetup/steps/PasswordStep";
import { QuickSummaryStep } from "@app/components/serverSetup/steps/QuickSummaryStep";

const STEP_COMPONENTS: Record<SetupStepId, ComponentType<SetupStepProps>> = {
  addresses: AddressesStep,
  language: LanguageStep,
  signIn: SignInStep,
  email: EmailStep,
  files: FilesStep,
  ai: AiStep,
  analytics: AnalyticsStep,
  password: PasswordStep,
  summary: QuickSummaryStep,
};

/** Where each server password error belongs on the Password step. */
function passwordErrors(error: PasswordChangeError): StepErrors {
  switch (error.code) {
    case "incorrectPassword":
      return { currentPassword: "passwordIncorrect" };
    case "passwordUnchanged":
      return { newPassword: "passwordUnchanged" };
    case "passwordMismatch":
      return { confirmPassword: "passwordMismatch" };
    default:
      return { newPassword: "passwordRejected" };
  }
}

function usernameErrors(error: UsernameChangeError): StepErrors {
  return {
    adminUsername:
      error.code === "usernameExists" ? "usernameTaken" : "username",
  };
}

/** The account card's progress; "updating" holds the card while the details save. */
type AccountState = "editing" | "updating" | "failed" | "signInAgain";

type FrameProps = ComponentProps<typeof SetupStepFrame>;

type Phase =
  | { kind: "password" }
  | { kind: "start" }
  | { kind: "step"; index: number }
  | { kind: "finish" };

/** Prefill for the address fields; empty where the page is not served over http(s). */
function pageOrigin(): string {
  if (!/^https?:$/.test(window.location.protocol)) return "";
  return `${window.location.origin}${withBasePath("/")}`.replace(/\/+$/, "");
}

function useStepCopy() {
  const { t } = useTranslation();
  return (step: SetupStepId) => {
    switch (step) {
      case "addresses":
        return {
          title: t("serverSetup.addresses.title", "Addresses"),
          subtitle: t(
            "serverSetup.addresses.subtitle",
            "How people and sign-in providers reach this server.",
          ),
        };
      case "language":
        return {
          title: t("serverSetup.language.title", "Language"),
          subtitle: t(
            "serverSetup.language.subtitle",
            "What new visitors see first.",
          ),
        };
      case "signIn":
        return {
          title: t("serverSetup.signIn.title", "Sign-in"),
          subtitle: t("serverSetup.signIn.subtitle", "How your team signs in."),
        };
      case "email":
        return {
          title: t("serverSetup.email.title", "Email"),
          subtitle: t(
            "serverSetup.email.subtitle",
            "For invites, signing requests and shares.",
          ),
        };
      case "files":
        return {
          title: t("serverSetup.files.title", "Files"),
          subtitle: t("serverSetup.files.subtitle", "Where files live."),
        };
      case "ai":
        return {
          title: t("serverSetup.ai.title", "AI"),
          subtitle: t(
            "serverSetup.ai.subtitle",
            "Document questions, automated edits and AI agents.",
          ),
        };
      case "summary":
        return {
          title: t("serverSetup.summary.title", "Quick start"),
          subtitle: t(
            "serverSetup.summary.subtitle",
            "Check the essentials. Everything else keeps its default.",
          ),
        };
      case "password":
        return {
          title: t("serverSetup.account.title", "Set up your account"),
          subtitle: t(
            "serverSetup.account.subtitle",
            "Choose how you'll sign in from now on.",
          ),
        };
      case "analytics":
        return {
          title: t("serverSetup.analytics.title", "Analytics"),
          subtitle: t(
            "serverSetup.analytics.subtitle",
            "Help make Stirling PDF better.",
          ),
        };
    }
  };
}

interface ServerSetupWizardProps {
  onDone: () => void;
  passwordChange?: { usingDefaultCredentials: boolean };
  onPasswordChanged?: () => void;
}

function ServerSetupFlow({
  settings,
  onDone,
  passwordChange,
  onPasswordChanged,
}: ServerSetupWizardProps & { settings: Record<string, unknown> }) {
  // Setup's own card is up, so the sign-in card has done its job.
  useEffect(() => clearSetupSignIn(), []);
  const { t } = useTranslation();
  const stepCopy = useStepCopy();
  const [initial] = useState(() => draftFromSettings(settings));
  const usingDefaultCredentials =
    passwordChange?.usingDefaultCredentials === true;
  const [draft, setDraft] = useState<ServerSetupDraft>(() => ({
    ...prefillAddresses(initial, pageOrigin()),
    analytics: initial.analytics ?? true,
    mcpEnabled: true,
    currentPassword: usingDefaultCredentials
      ? DEFAULT_ADMIN_CREDENTIALS.password
      : "",
  }));
  const [mode, setMode] = useState<SetupMode>("quick");
  // Owed account details come first, so the default login stops working
  // before the admin spends any time on settings.
  const [phase, setPhase] = useState<Phase>(
    passwordChange ? { kind: "password" } : { kind: "start" },
  );
  const [accountState, setAccountState] = useState<AccountState>("editing");
  const { signOut } = useAuth();
  const [errors, setErrors] = useState<StepErrors>({});
  const [openSection, setOpenSection] = useState<ExpandableSection | null>(
    null,
  );
  const [dismissing, setDismissing] = useState(false);
  const [dismissFailed, setDismissFailed] = useState(false);

  const steps = stepsFor(mode);
  const {
    state: finishState,
    finish,
    saveAccount,
    complete,
    reset,
  } = useSetupFinish({ onDone, onPasswordChanged });

  // Custom's AI card starts on "Your own AI", so its fields are there to fill
  // in; only the first visit applies it, so switching AI off sticks.
  const aiDefaulted = useRef(false);
  // True while that default is in the draft, so a switch to Quick start can undo it.
  const aiAutoSet = useRef(false);

  const goTo = (next: Phase) => {
    setErrors({});
    setPhase(next);
    if (next.kind !== "step") return;
    const step = steps[next.index];
    let target = draft;
    if (step === "ai" && mode === "custom" && !aiDefaulted.current) {
      aiDefaulted.current = true;
      if (draft.ai === "off") {
        target = { ...draft, ai: "custom" };
        setDraft(target);
        aiAutoSet.current = true;
      }
    }
    setOpenSection(initialOpenSection(step, target));
  };

  const notNow = async () => {
    setDismissing(true);
    setDismissFailed(false);
    try {
      await markSetupComplete();
      complete();
    } catch {
      setDismissFailed(true);
      setDismissing(false);
    }
  };

  /** Errors `step` has in `section`'s fields. */
  const sectionErrors = (
    step: SetupStepId,
    section: ExpandableSection,
  ): StepErrors =>
    Object.fromEntries(
      Object.entries(validateStep(step, draft, mode)).filter(
        ([field]) =>
          sectionForField(field as keyof ServerSetupDraft) === section,
      ),
    );

  const saveSection = (section: ExpandableSection) => {
    if (phase.kind !== "step") return;
    const step = steps[phase.index];
    const found = sectionErrors(step, section);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    setErrors({});
    setOpenSection(nextOpenSection(step, draft, section));
  };

  const stepProps: SetupStepProps = {
    draft,
    initial,
    update: (patch) => setDraft((current) => ({ ...current, ...patch })),
    errors,
    mode,
    usingDefaultCredentials,
    openSection,
    setOpenSection,
    saveSection,
  };

  /** Shows `stepErrors`, opening the section the first is in and focusing it. */
  const showErrors = (stepErrors: StepErrors) => {
    setErrors(stepErrors);
    const [first] = Object.keys(stepErrors) as (keyof ServerSetupDraft)[];
    const section = first ? sectionForField(first) : null;
    if (section) setOpenSection(section);
    if (first) {
      // After the render that opens its section and marks the field invalid.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
    }
  };

  const [checkingIssuers, setCheckingIssuers] = useState(false);

  /** Errors for issuers this step would save that the server cannot reach. */
  const unreachableIssuers = async (step: SetupStepId): Promise<StepErrors> => {
    const fields = issuersToCheck(step, draft, initial);
    if (fields.length === 0) return {};
    setCheckingIssuers(true);
    try {
      const reachable = await Promise.all(
        fields.map((field) => checkIssuer(draft[field]).catch(() => false)),
      );
      return Object.fromEntries(
        fields
          .filter((_, i) => !reachable[i])
          .map((field) => [field, "issuerUnreachable"]),
      );
    } finally {
      setCheckingIssuers(false);
    }
  };

  const startFinish = () => {
    goTo({ kind: "finish" });
    finish(initial, draftToSave(draft, initial, mode));
  };

  const submitAccount = () => {
    if (accountState === "updating") return;
    const stepErrors = validateStep("password", draft, mode);
    showErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setAccountState("updating");
    saveAccount(draft)
      .then(() => {
        // Nothing needs the passwords after this, so they leave memory now.
        setDraft((current) => ({
          ...current,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));
        setAccountState("editing");
        goTo({ kind: "start" });
      })
      .catch((error: unknown) => {
        if (error instanceof SignInAgainError) {
          setAccountState("signInAgain");
          return;
        }
        if (error instanceof PasswordChangeError) {
          setAccountState("editing");
          showErrors(passwordErrors(error));
        } else if (error instanceof UsernameChangeError) {
          setAccountState("editing");
          showErrors(usernameErrors(error));
        } else {
          setAccountState("failed");
        }
      });
  };

  const accountFrame = (): FrameProps => {
    switch (accountState) {
      case "updating":
        return {
          title: t(
            "serverSetup.account.updatingTitle",
            "Updating your details",
          ),
          subtitle: t("serverSetup.account.updatingSubtitle", "One moment."),
          primaryLabel: t("serverSetup.account.updating", "Updating"),
          onPrimary: () => {},
          primaryLoading: true,
        };
      case "signInAgain":
        return {
          title: t(
            "serverSetup.account.signInAgainTitle",
            "Your details are saved",
          ),
          subtitle: t(
            "serverSetup.account.signInAgainSubtitle",
            "Sign in again with your new username and password to carry on.",
          ),
          primaryLabel: t("serverSetup.account.signIn", "Sign in"),
          onPrimary: () => void signOut(),
        };
      default:
        return {
          ...stepCopy("password"),
          primaryLabel: t("serverSetup.account.save", "Save and continue"),
          onPrimary: submitAccount,
          children: (
            <>
              <PasswordStep {...stepProps} />
              {accountState === "failed" && (
                <SetupNote tone="warning">
                  <p className={styles.noteText}>
                    {t(
                      "serverSetup.account.failed",
                      "Couldn't save your details. Check the server is reachable and try again.",
                    )}
                  </p>
                </SetupNote>
              )}
            </>
          ),
        };
    }
  };

  // The analytics answer is the button itself, so it reads as consent.
  const analyticsLabel = (accept: boolean, isLast: boolean) => {
    if (accept) {
      return isLast
        ? t("serverSetup.analytics.acceptFinish", "Accept and finish")
        : t("serverSetup.analytics.accept", "Accept and continue");
    }
    return isLast
      ? t("serverSetup.analytics.declineFinish", "Decline and finish")
      : t("serverSetup.analytics.decline", "Decline and continue");
  };

  const startFrame = (): FrameProps => {
    const setupLabel = t("serverSetup.start.setupLabel", "Setup");
    return {
      title: t("serverSetup.start.title", "Your server is up"),
      subtitle: t(
        "serverSetup.start.subtitle",
        "Set it up for your team in a few steps.",
      ),
      primaryLabel: t("serverSetup.continue", "Continue"),
      onPrimary: () => goTo({ kind: "step", index: 0 }),
      primaryLoading: dismissing,
      secondaryLabel: t("serverSetup.notNow", "Not now"),
      onSecondary: () => void notNow(),
      children: (
        <>
          <SettingRow label={setupLabel}>
            {() => (
              <SegmentedControl
                fullWidth
                ariaLabel={setupLabel}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  if (next === "quick" && aiAutoSet.current) {
                    aiAutoSet.current = false;
                    aiDefaulted.current = false;
                    setDraft((current) => ({ ...current, ai: initial.ai }));
                  }
                }}
                options={[
                  {
                    value: "quick",
                    label: t("serverSetup.start.quick", "Quick start"),
                  },
                  {
                    value: "custom",
                    label: t("serverSetup.start.custom", "Custom"),
                  },
                ]}
              />
            )}
          </SettingRow>
          {dismissFailed && (
            <SetupNote tone="warning">
              <p className={styles.noteText}>
                {t(
                  "serverSetup.start.dismissFailed",
                  "Couldn't skip setup. Check you're still signed in as an admin.",
                )}
              </p>
            </SetupNote>
          )}
        </>
      ),
    };
  };

  const stepFrame = (index: number): FrameProps => {
    const step = steps[index];
    const Step = STEP_COMPONENTS[step];
    const isLast = index === steps.length - 1;
    return {
      ...stepCopy(step),
      progress: { current: index + 1, total: steps.length },
      onBack: () =>
        goTo(
          index === 0 ? { kind: "start" } : { kind: "step", index: index - 1 },
        ),
      primaryLabel:
        step === "analytics"
          ? analyticsLabel(draft.analytics !== false, isLast)
          : isLast
            ? t("serverSetup.finishSetup", "Finish setup")
            : t("serverSetup.continue", "Continue"),
      primaryLoading: checkingIssuers,
      onPrimary: () => {
        if (checkingIssuers) return;
        const stepErrors = validateStep(step, draft, mode);
        showErrors(stepErrors);
        if (Object.keys(stepErrors).length > 0) return;
        const advance = () =>
          isLast ? startFinish() : goTo({ kind: "step", index: index + 1 });
        if (issuersToCheck(step, draft, initial).length === 0) {
          advance();
          return;
        }
        void unreachableIssuers(step).then((issuerErrors) => {
          if (Object.keys(issuerErrors).length > 0) showErrors(issuerErrors);
          else advance();
        });
      },
      children: <Step {...stepProps} />,
    };
  };

  const finishFrame = (): FrameProps => {
    switch (finishState) {
      case "restarting":
        return {
          title: t(
            "serverSetup.finish.restartingTitle",
            "Restarting your server",
          ),
          subtitle: t(
            "serverSetup.finish.restartingSubtitle",
            "This page reloads when it's back, usually within a minute.",
          ),
        };
      case "manualRestart":
      case "restartFailed":
        return {
          title: t("serverSetup.finish.manualTitle", "Settings saved"),
          subtitle:
            finishState === "manualRestart"
              ? t(
                  "serverSetup.finish.manualSubtitle",
                  "This server can't restart itself. Restart its container or service to apply them.",
                )
              : t(
                  "serverSetup.finish.restartFailedSubtitle",
                  "The server didn't restart. Restart its container or service to apply them.",
                ),
          primaryLabel: t("serverSetup.continue", "Continue"),
          onPrimary: complete,
        };
      case "error":
        return {
          title: t(
            "serverSetup.finish.errorTitle",
            "Couldn't save your settings",
          ),
          subtitle: t(
            "serverSetup.finish.errorSubtitle",
            "Nothing was restarted.",
          ),
          onBack: () => {
            reset();
            goTo({ kind: "step", index: steps.length - 1 });
          },
          primaryLabel: t("serverSetup.finish.retry", "Try again"),
          onPrimary: startFinish,
          children: (
            <SetupNote tone="warning">
              <p className={styles.noteText}>
                {t(
                  "serverSetup.finish.errorNote",
                  "Check the server is reachable and that you're still signed in as an admin.",
                )}
              </p>
            </SetupNote>
          ),
        };
      default:
        return {
          title: t("serverSetup.finish.savingTitle", "Saving your settings"),
          subtitle: t("serverSetup.finish.savingSubtitle", "One moment."),
          primaryLabel: t("serverSetup.finish.saving", "Saving"),
          onPrimary: () => {},
          primaryLoading: true,
        };
    }
  };

  const frame =
    phase.kind === "password"
      ? accountFrame()
      : phase.kind === "start"
        ? startFrame()
        : phase.kind === "finish"
          ? finishFrame()
          : stepFrame(phase.index);

  // One frame for every phase, so its height animates between them.
  return (
    <SetupScreen>
      <SetupStepFrame {...frame} />
    </SetupScreen>
  );
}

/** First-run settings for a new self-hosted server, shown once to its first admin. */
export function ServerSetupWizard({
  onDone,
  passwordChange,
  onPasswordChanged,
}: ServerSetupWizardProps) {
  const { t } = useTranslation();
  const settings = useQuery({
    queryKey: ["serverSetup", "settings"],
    queryFn: fetchServerSettings,
    staleTime: Infinity,
    retry: false,
  });

  if (settings.isPending) {
    return isSetupSignInPending() ? <SetupSignInScreen /> : null;
  }
  if (settings.isError) {
    return (
      <SetupScreen>
        <SetupStepFrame
          title={t("serverSetup.loadErrorTitle", "Couldn't load your settings")}
          subtitle={t(
            "serverSetup.loadErrorSubtitle",
            "Setup needs the server's current settings to start.",
          )}
          primaryLabel={t("serverSetup.finish.retry", "Try again")}
          onPrimary={() => void settings.refetch()}
          secondaryLabel={t("serverSetup.notNow", "Not now")}
          onSecondary={() => {
            markSetupComplete()
              .then(onDone)
              .catch(() => {});
          }}
        />
      </SetupScreen>
    );
  }
  return (
    <ServerSetupFlow
      settings={settings.data}
      onDone={onDone}
      passwordChange={passwordChange}
      onPasswordChanged={onPasswordChanged}
    />
  );
}
