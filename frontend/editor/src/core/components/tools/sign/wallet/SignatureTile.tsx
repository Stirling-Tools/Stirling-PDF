import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@app/ui/Dropdown";
import { Icon, type IconName } from "@app/ui/Icon";
import styles from "@app/components/tools/sign/wallet/SignatureTile.module.css";

export interface SignatureTileAction {
  id: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  onSelect: () => void;
}

interface SignatureTileProps {
  label: string;
  dataUrl: string;
  selected: boolean;
  isDefault?: boolean;
  badge?: string;
  disabled?: boolean;
  actions: SignatureTileAction[];
  onClick: () => void;
}

export function SignatureTile({
  label,
  dataUrl,
  selected,
  isDefault = false,
  badge,
  disabled = false,
  actions,
  onClick,
}: SignatureTileProps) {
  const { t } = useTranslation();
  const defaultLabel = t("sign.wallet.default", "Default");

  return (
    <div className={styles.tile} data-testid="signature-tile">
      <button
        type="button"
        className={styles.paper}
        aria-pressed={selected}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <img className={styles.image} src={dataUrl} alt="" />
        {badge && <span className={styles.badge}>{badge}</span>}
        <span className={styles.check} aria-hidden>
          <Icon name="check" size={11} strokeWidth={3.2} />
        </span>
      </button>
      <SignatureTileMenu label={label} actions={actions} disabled={disabled} />
      <span className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        {isDefault && (
          <span className={styles.star} title={defaultLabel}>
            <Icon name="star" size={12} filled title={defaultLabel} />
          </span>
        )}
      </span>
    </div>
  );
}

interface SignatureTileMenuProps {
  label: string;
  actions: SignatureTileAction[];
  disabled: boolean;
}

function SignatureTileMenu({
  label,
  actions,
  disabled,
}: SignatureTileMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const firstDanger = actions.findIndex((action) => action.danger);

  return (
    <div className={styles.menu} data-open={open || undefined}>
      <Dropdown.Root open={open} onOpenChange={setOpen} align="end">
        <Dropdown.Trigger>
          <button
            type="button"
            className={styles.menuButton}
            aria-label={t("sign.wallet.menu.options", "Options for {{name}}", {
              name: label,
            })}
            disabled={disabled}
          >
            <Icon name="ellipsis" size={14} />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Menu width={200}>
          {actions.map((action, index) => (
            <Fragment key={action.id}>
              {index === firstDanger && index > 0 && <Dropdown.Divider />}
              <Dropdown.Item
                onSelect={action.onSelect}
                leading={<Icon name={action.icon} size={15} />}
                className={action.danger ? styles.danger : undefined}
              >
                {action.label}
              </Dropdown.Item>
            </Fragment>
          ))}
        </Dropdown.Menu>
      </Dropdown.Root>
    </div>
  );
}

interface NewSignatureTileProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export function NewSignatureTile({
  label,
  disabled = false,
  onClick,
}: NewSignatureTileProps) {
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={`${styles.paper} ${styles.newPaper}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid="new-signature-tile"
      >
        <Icon name="plus" size={20} />
      </button>
      <span className={styles.label}>
        <span className={styles.labelText}>{label}</span>
      </span>
    </div>
  );
}
