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

  const authenticate = (path: "/signup" | "/login") => {
    const next = location.pathname + location.search + location.hash;
    setDetail(null);
    navigate(
      isSafePostLoginRedirect(next)
        ? `${path}?next=${encodeURIComponent(next)}`
        : path,
    );
  };

  const title = t(
    "payg.signupRequired.processorTitle",
    "Create an account to unlock the best of Stirling",
  );

  return (
    <OnboardingSlideShell
      opened={detail !== null && isAnonymous}
      onClose={() => setDetail(null)}
      ariaLabel={title}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      stepIndex={0}
      stepCount={1}
      slideKey="guest-signup"
      hero={
        <div className={styles.surfaces}>
          <div className={styles.surface}>
            <ShellHero>
              <Icon name="book-open" size={32} className={styles.heroIcon} />
            </ShellHero>
            <span>{t("payg.signupRequired.readerLabel", "PDF Reader")}</span>
          </div>
          <div className={styles.surface}>
            <ShellHero>
              <Icon name="pencil" size={32} className={styles.heroIcon} />
            </ShellHero>
            <span>{t("payg.signupRequired.editorLabel", "PDF Editor")}</span>
          </div>
          <div className={styles.surface}>
            <ShellHero>
              <Icon name="cpu" size={32} className={styles.heroIcon} />
            </ShellHero>
            <span>
              {t("payg.signupRequired.processorLabel", "PDF Processor")}
            </span>
          </div>
        </div>
      }
      title={<h2 className={styles.title}>{title}</h2>}
      body={
        <div className={styles.body}>
          <ul className={styles.benefits}>
            <li>
              <span className={styles.benefitIcon}>
                <Icon name="file-text" size={18} />
              </span>
              <span>
                {t(
                  "payg.signupRequired.manualToolsPromo",
                  "Unlimited free manual PDF tools",
                )}
              </span>
            </li>
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
