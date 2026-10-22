import type { ReactNode } from "react";
import { Icon, type IconName } from "@app/ui/Icon";
import styles from "@app/components/tools/sign/wallet/SignatureWallet.module.css";

interface SignatureSectionProps {
  title: string;
  meta?: string;
  icon?: IconName;
  children: ReactNode;
}

export function SignatureSection({
  title,
  meta,
  icon,
  children,
}: SignatureSectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        {icon && <Icon name={icon} size={14} className={styles.sectionIcon} />}
        <h3 className={styles.sectionTitle}>{title}</h3>
        {meta && <span className={styles.sectionMeta}>{meta}</span>}
      </div>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}
