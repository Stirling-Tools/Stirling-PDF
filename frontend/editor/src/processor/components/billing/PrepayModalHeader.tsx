import { useTranslation } from "react-i18next";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";

/**
 * The prepay flows' stepped header — the prepaid wizard (activation → calculator → pay, of 3) and
 * the metered checkout (spend limit → payment, of 2).
 *
 * Chrome and copy only: the layout is the shared {@link StepModalHeader}, so this flow reads the
 * same as every other stepped modal. Keeps the billing root class, which the framed-checkout rule
 * targets to own the header's padding. Pass {@code step=undefined} to hide the badge + progress
 * (e.g. a terminal confirmation).
 */
export function PrepayModalHeader({
  step,
  total = 3,
  title,
  onClose,
}: {
  step?: number;
  /** Total steps in this flow (3 for the prepaid wizard, 2 for the metered checkout). */
  total?: number;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <StepModalHeader
      brand
      className="processor-billing__bundle-head"
      title={title}
      step={step}
      total={total}
      stepLabel={
        step != null
          ? t(
              "processor.billing.prepaid.buy.step",
              "Step {{current}} of {{total}}",
              {
                current: step,
                total,
              },
            )
          : undefined
      }
      closeLabel={t("processor.billing.prepaid.buy.close", "Close")}
      onClose={onClose}
    />
  );
}
