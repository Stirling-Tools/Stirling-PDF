import type { ReactNode } from "react";
import { Icon, type IconName } from "@editor/ui/Icon";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import styles from "@editor/components/tools/sign/wallet/SignatureWallet.module.css";

interface SignatureSectionProps {
  title: string;
  /** Live readout beside the title, such as a count. */
  meta?: string;
  /** Explanation of the section, shown behind an (i) after the title. */
  info?: string;
  icon?: IconName;
  children: ReactNode;
}

export function SignatureSection({
  title,
  meta,
  info,
  icon,
  children,
}: SignatureSectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        {icon && <Icon name={icon} size={14} className={styles.sectionIcon} />}
        <h3 className={styles.sectionTitle}>
          {title}
          {info && <ToolInfoTooltip label={info} />}
        </h3>
        {meta && <span className={styles.sectionMeta}>{meta}</span>}
      </div>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}
