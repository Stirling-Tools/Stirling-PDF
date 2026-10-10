import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Logo } from "@app/ui/Logo";
import styles from "@app/components/runLocation/RunLocation.module.css";

interface RunLocationStepLayoutProps {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
  /** Shows a back button below the content when set. */
  onBack?: () => void;
}

export function RunLocationStepLayout({
  title,
  subtitle,
  children,
  onBack,
}: RunLocationStepLayoutProps) {
  const { t } = useTranslation();
  return (
    <>
      <header className={styles.header}>
        <Logo variant="iconOnly" iconHeight="2.5rem" />
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </header>
      <div className={styles.body}>
        {children}
        {onBack && (
          <Button
            variant="secondary"
            fat
            fullWidth
            leftSection={<Icon name="arrow-left" size={18} />}
            onClick={onBack}
          >
            {t("runLocation.back", "Back")}
          </Button>
        )}
      </div>
    </>
  );
}
