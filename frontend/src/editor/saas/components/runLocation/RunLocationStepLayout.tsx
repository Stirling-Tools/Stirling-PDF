import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SetupCardLayout } from "@app/components/shared/setupCard/SetupCardLayout";

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
    <SetupCardLayout title={title} subtitle={subtitle}>
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
    </SetupCardLayout>
  );
}
