import { useId } from "react";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useDropTarget } from "@app/components/filesPage/useDropTarget";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";

/** Accepts a single native folder through its drop handler; the footer is outside the drop target. */
export function ProcessingFolderActionCard({
  title,
  description,
  onChoose,
  footer,
  onDrop,
  disabled,
}: {
  title: string;
  description: string;
  onChoose: () => void;
  footer?: { label: string; onClick: () => void };
  onDrop?: (dataTransfer: DataTransfer) => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { handlers, isOver } = useDropTarget({
    dragType: "Files",
    dropEffect: "copy",
    disabled: disabled || !onDrop,
    onDrop: (event) => {
      event.stopPropagation();
      onDrop?.(event.dataTransfer);
    },
  });
  return (
    <section className="folder-setup__action-card" aria-labelledby={titleId}>
      <button
        type="button"
        className="folder-setup__dropzone"
        disabled={disabled}
        onClick={onChoose}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-dragging={isOver || undefined}
        aria-busy={disabled || undefined}
        {...handlers}
      >
        <span
          className={`${styles.heroTile} folder-setup__action-icon`}
          aria-hidden="true"
        >
          <Icon name="folder-open" size={30} />
        </span>
        <span className="folder-setup__action-copy">
          <span className="folder-setup__action-title" id={titleId}>
            {title}
          </span>
          <span className="folder-setup__action-description" id={descriptionId}>
            {description}
          </span>
        </span>
      </button>
      {footer && (
        <div className="folder-setup__action-footer">
          <Button
            variant="quiet"
            accent="neutral"
            px="none"
            fontSize="sm"
            disabled={disabled}
            onClick={footer.onClick}
          >
            {footer.label}
          </Button>
        </div>
      )}
    </section>
  );
}
