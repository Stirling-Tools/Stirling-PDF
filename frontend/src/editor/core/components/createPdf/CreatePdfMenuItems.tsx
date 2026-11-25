import type { ReactNode } from "react";
import { Menu } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import type { CreatePdfMenuItem } from "@editor/components/createPdf/useCreatePdfMenu";
import styles from "@editor/components/createPdf/CreatePdfMenuItems.module.css";

interface RichMenuItemProps {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}

export function RichMenuItem({
  icon,
  label,
  description,
  onClick,
  disabled,
  testId,
}: RichMenuItemProps) {
  return (
    <Menu.Item
      className={styles.item}
      leftSection={
        <span className={styles.chip} aria-hidden>
          {icon}
        </span>
      }
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span className={styles.label}>{label}</span>
      {description && <span className={styles.description}>{description}</span>}
    </Menu.Item>
  );
}

interface CreatePdfMenuItemsProps {
  items: CreatePdfMenuItem[];
  disabled?: boolean;
}

export function CreatePdfMenuItems({
  items,
  disabled,
}: CreatePdfMenuItemsProps) {
  return items.map((item) => (
    <RichMenuItem
      key={item.id}
      icon={<Icon name={item.icon} size={16} />}
      label={item.label}
      description={item.description}
      onClick={item.onClick}
      disabled={disabled}
      testId={item.testId}
    />
  ));
}
