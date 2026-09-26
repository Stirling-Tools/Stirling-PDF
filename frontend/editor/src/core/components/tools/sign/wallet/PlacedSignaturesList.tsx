import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { DrawingControls } from "@app/components/annotation/shared/DrawingControls";
import type { PlacedSignature } from "@app/contexts/SignatureContext";
import type { HistoryAvailability } from "@app/hooks/useHistoryAvailability";
import styles from "@app/components/tools/sign/wallet/PlacedSignaturesList.module.css";

interface PlacedSignaturesListProps {
  placed: PlacedSignature[];
  nameFor: (entry: PlacedSignature) => string;
  history: HistoryAvailability;
  onUndo?: () => void;
  onRedo?: () => void;
  onShow: (entry: PlacedSignature) => void;
  onRemove: (entry: PlacedSignature) => void;
}

export function PlacedSignaturesList({
  placed,
  nameFor,
  history,
  onUndo,
  onRedo,
  onShow,
  onRemove,
}: PlacedSignaturesListProps) {
  const { t } = useTranslation();

  return (
    <section className={styles.section} data-testid="placed-signatures">
      <div className={styles.header}>
        <h3 className={styles.title}>
          {t("sign.wallet.placed.title", "On this document ({{count}})", {
            count: placed.length,
          })}
        </h3>
        <DrawingControls
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          showPlaceButton={false}
        />
      </div>
      {placed.length === 0 ? (
        <p className={styles.empty}>
          {t(
            "sign.wallet.placed.empty",
            "Signatures you place on the page are listed here.",
          )}
        </p>
      ) : (
        <ul className={styles.list}>
          {placed.map((entry) => (
            <PlacedSignatureRow
              key={entry.id}
              entry={entry}
              name={nameFor(entry)}
              onShow={() => onShow(entry)}
              onRemove={() => onRemove(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface PlacedSignatureRowProps {
  entry: PlacedSignature;
  name: string;
  onShow: () => void;
  onRemove: () => void;
}

function PlacedSignatureRow({
  entry,
  name,
  onShow,
  onRemove,
}: PlacedSignatureRowProps) {
  const { t } = useTranslation();

  return (
    <li className={styles.row}>
      <span className={styles.thumb} aria-hidden>
        {entry.imageSrc && (
          <img className={styles.thumbImage} src={entry.imageSrc} alt="" />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.where}>
          {t("sign.wallet.placed.page", "Page {{page}}", {
            page: entry.pageIndex + 1,
          })}
        </span>
      </span>
      <ActionIcon
        variant="tertiary"
        size="sm"
        aria-label={t("sign.wallet.placed.show", "Show {{name}} on the page", {
          name,
        })}
        onClick={onShow}
      >
        <Icon name="locate-fixed" size={15} />
      </ActionIcon>
      <ActionIcon
        variant="tertiary"
        size="sm"
        accent="danger"
        aria-label={t("sign.wallet.placed.remove", "Remove {{name}}", { name })}
        onClick={onRemove}
      >
        <Icon name="trash" size={15} />
      </ActionIcon>
    </li>
  );
}
