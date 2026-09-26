import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

interface ApplySignaturesButtonProps {
  count: number;
  disabled: boolean;
  onApply: () => void;
}

export function ApplySignaturesButton({
  count,
  disabled,
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
      disabled={disabled || count === 0}
      data-testid="apply-signatures"
    >
      {label}
    </Button>
  );
}
