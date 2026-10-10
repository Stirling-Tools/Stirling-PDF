import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

interface ApplySignaturesButtonProps {
  count: number;
  disabled: boolean;
  applying?: boolean;
  onApply: () => void;
}

export function ApplySignaturesButton({
  count,
  disabled,
  applying = false,
  onApply,
}: ApplySignaturesButtonProps) {
  const { t } = useTranslation();
  const label =
    count === 0
      ? t("sign.wallet.applyEmpty", "Apply signatures")
      : t("sign.wallet.apply", "Apply {{count}} signatures", { count });

  return (
    <Button
      fullWidth
      onClick={onApply}
      disabled={disabled || applying || count === 0}
      loading={applying}
      data-testid="apply-signatures"
    >
      {label}
    </Button>
  );
}
