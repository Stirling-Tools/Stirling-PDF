import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { authService } from "@app/services/authService";
import OnboardingSlideShell, {
  ShellHero,
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
import { SetupWizard } from "@app/components/SetupWizard";
import WelcomeSlide from "@app/components/onboarding/slides/WelcomeSlide";
import { connectionModeService } from "@app/services/connectionModeService";
import { ClassificationDemoModal } from "@app/components/onboarding/classificationDemo/ClassificationDemoModal";

/** Bumped whenever the welcome copy changes materially: it means "has seen the current
 *  welcome", not "has launched before". The old key is left behind, not migrated. */
const ONBOARDING_KEY = "stirling-desktop-onboarding-seen.v2";
/** Separate from ONBOARDING_KEY so installs that predate the trick still get it once. */
const CLASSIFICATION_DEMO_KEY = "stirling-desktop-classification-demo-seen";

/** Desktop onboarding: welcome → sign-in → the classification demo, replacing the core flow
 *  aimed at server admins. Uses the shared shell, as every other onboarding does. */
export function DesktopOnboardingModal() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY),
  );
  const [step, setStep] = useState(0);
  // The classification demo follows the welcome flow. Someone who onboarded before it existed has
  // no welcome flow left to follow, so they start here.
  const [classificationDemo, setClassificationDemo] = useState(
    () =>
      !localStorage.getItem(CLASSIFICATION_DEMO_KEY) &&
      !!localStorage.getItem(ONBOARDING_KEY),
  );

  // Null until known. A key bump re-runs this for people already signed in, and
  // dismissing the sign-in slide drops them to local mode — a copy change must not.
  const [needsSignIn, setNeedsSignIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authService
      .isAuthenticated()
      .then((authed) => {
        if (!cancelled) setNeedsSignIn(!authed);
      })
      .catch(() => {
        // Unknown session: offer sign-in rather than assume one exists.
        if (!cancelled) setNeedsSignIn(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
    setClassificationDemo(!localStorage.getItem(CLASSIFICATION_DEMO_KEY));
  };

  const dismissFinal = () => {
    finish();
    // Only for someone offered sign-in who declined: they have no server connection.
    // Doing this to an authenticated user would sign them out of SaaS.
    if (needsSignIn) {
      connectionModeService.switchToLocal().catch(console.error);
    }
  };

  // The welcome slide advances rather than closes: skipping the account step strands
  // the user. With no account step to reach, it simply ends.
  const handleClose = () => {
    if (step === 0 && needsSignIn) {
      setStep(1);
    } else {
      dismissFinal();
    }
  };

  // No reload: AppProviders remounts on mode change, avoiding the WebView2 freeze
  // window.location.reload() causes during a backgrounded OAuth flow.
  const handleComplete = finish;

  // Called as a data factory (not rendered as a component) — memoised so it isn't
  // reconstructed on every render while the modal is open.
  const welcomeSlide = useMemo(() => WelcomeSlide(), []);

  if (!visible) {
    // Accepting the offer hands the workbench canvas to the sweep, which outlives this
    // modal — the session store owns it from there, so nothing else needs to stay mounted.
    return classificationDemo ? (
      <ClassificationDemoModal
        opened
        onClose={() => {
          localStorage.setItem(CLASSIFICATION_DEMO_KEY, "true");
          setClassificationDemo(false);
        }}
      />
    ) : null;
  }

  // Held back until the session is known: rendering first would flash "Step 1 of 2" and
  // then drop to one step for an already-signed-in user.
  if (needsSignIn === null) return null;

  const isWelcome = step === 0;

  // Sign-in draws its own actions inside SetupWizard, so the shell footer stays empty
  // rather than offering a second, competing way forward.
  const buttons: ShellButton[] = isWelcome
    ? [
        {
          key: "welcome-next",
          label: needsSignIn
            ? t("onboarding.buttons.next", "Next →")
            : t("onboarding.buttons.getStarted", "Get started"),
          primary: true,
          action: "next",
        },
      ]
    : [];

  return (
    <OnboardingSlideShell
      opened
      // Sign-in draws its own logo and heading, so the shell adds only chrome: a hero
      // and a second title would just push the form down the card.
      hero={isWelcome ? <ShellHero appIcon /> : undefined}
      slideKey={isWelcome ? "desktop-welcome" : "desktop-sign-in"}
      title={isWelcome ? welcomeSlide.title : undefined}
      body={
        isWelcome ? (
          welcomeSlide.body
        ) : (
          // No onClose: that prop draws the wizard's own close button, and the card
          // already has one. SignInModal still passes it, being the only way out there.
          <SetupWizard noLayout onComplete={handleComplete} />
        )
      }
      stepIndex={step}
      stepCount={needsSignIn ? 2 : 1}
      buttons={buttons}
      onAction={() => (needsSignIn ? setStep(1) : finish())}
      // Neither slide can be dismissed: the header control moves the user through the
      // flow rather than out of it, and Escape does nothing.
      allowDismiss={false}
      headerControl="forward"
      onClose={handleClose}
    />
  );
}
