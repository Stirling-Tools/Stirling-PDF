import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui/Banner";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";

interface PlacementStatusProps {
  placing: string | null;
  onStop: () => void;
}

export function PlacementStatus({ placing, onStop }: PlacementStatusProps) {
  const { t } = useTranslation();
  const icon = <Icon name="locate-fixed" size={16} />;

  return (
    <div data-testid="placement-status">
      {placing ? (
        <Banner
          tone="info"
          icon={icon}
          description={t(
            "sign.wallet.status.placing",
            "Click the page to place {{name}}.",
            { name: placing },
          )}
          action={
            <Button variant="secondary" size="sm" onClick={onStop}>
              {t("sign.wallet.status.stop", "Stop")}
            </Button>
          }
        />
      ) : (
        <Banner
          tone="neutral"
          icon={icon}
          description={t(
            "sign.wallet.status.idle",
            "Pick a signature to place it",
          )}
        />
      )}
    </div>
  );
}
