import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@app/ui/Icon";
import OnboardingSlideShell, {
  ShellHero,
} from "@app/components/onboarding/OnboardingSlideShell";
import styles from "@app/components/SignupRequiredBootstrap.module.css";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import type { PaygSignupRequiredDetail } from "@app/services/paygErrorInterceptor";

/** Opens one guest signup prompt for a Processor click or server account gate, preserving the return route. */
export default function SignupRequiredBootstrap() {
  const { t } = useTranslation();
  const { isAnonymous } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<PaygSignupRequiredDetail | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const incoming = (ev as CustomEvent<PaygSignupRequiredDetail>).detail;
      setDetail((current) => current ?? incoming ?? { category: null });
    };
    window.addEventListener("payg:signupRequired", handler);
    return () => window.removeEventListener("payg:signupRequired", handler);
  }, []);

  useEffect(() => {
    if (!isAnonymous) setDetail(null);
  }, [isAnonymous]);

  const limitReached = detail?.reason === "GUEST_TOOL_LIMIT_REACHED";
  const authenticate = (path: "/signup" | "/login") => {
    const next = location.pathname + location.search + location.hash;
    setDetail(null);
    navigate(
      isSafePostLoginRedirect(next)
        ? `${path}?next=${encodeURIComponent(next)}`
        : path,
    );
  };

  const title = limitReached
    ? t("payg.signupRequired.guestLimitTitle", "Keep going with a free account")
    : t("payg.signupRequired.processorTitle", "Unlock Processor");

  return (
    <OnboardingSlideShell
      opened={detail !== null && isAnonymous}
      onClose={() => setDetail(null)}
      ariaLabel={title}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      stepIndex={0}
      stepCount={1}
      slideKey={limitReached ? "guest-limit" : "guest-processor"}
      hero={
        <ShellHero>
          <Icon name="cpu" size={32} className={styles.heroIcon} />
        </ShellHero>
      }
      title={<h2 className={styles.title}>{title}</h2>}
      body={
        <div className={styles.body}>
          <p className={styles.intro}>
            {limitReached
              ? t(
                  "payg.signupRequired.guestLimitBody",
                  "You've used your {{count}} free guest runs. Create an account to keep going.",
                  { count: detail?.limit },
                )
              : t(
                  "payg.signupRequired.processorBody",
                  "Start with free monthly Processor credits.",
                )}
          </p>
          <ul className={styles.benefits}>
            <li>
              <span className={styles.benefitIcon}>
                <Icon name="sparkles" size={18} />
              </span>
              <span>
                {t(
                  "payg.signupRequired.aiPromo",
                  "Create, edit and ask about PDFs with AI",
                )}
              </span>
            </li>
            <li>
              <span className={styles.benefitIcon}>
                <Icon name="git-branch" size={18} />
              </span>
              <span>
                {t(
                  "payg.signupRequired.automationPromo",
                  "Automate repetitive PDF tasks",
                )}
              </span>
            </li>
            <li>
              <span className={styles.benefitIcon}>
                <Icon name="code" size={18} />
              </span>
              <span>
                {t(
                  "payg.signupRequired.apiPromo",
                  "Connect your apps and AI assistants",
                )}
              </span>
            </li>
          </ul>
          <p className={styles.note}>
            {t(
              "payg.signupRequired.reassurance",
              "Manual tools stay free. No credit card required.",
            )}
          </p>
        </div>
      }
      buttons={[
        {
          key: "login",
          label: t("payg.signupRequired.login", "Log in"),
          action: "login",
        },
        {
          key: "signup",
          label: t("payg.signupRequired.createAccount", "Create free account"),
          primary: true,
          action: "signup",
        },
      ]}
      onAction={(action) =>
        authenticate(action === "login" ? "/login" : "/signup")
      }
    />
  );
}
