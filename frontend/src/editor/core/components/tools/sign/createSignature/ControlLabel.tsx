import type { ReactNode } from "react";
import styles from "@app/components/tools/sign/createSignature/ControlLabel.module.css";

interface ControlLabelProps {
  id?: string;
  children: ReactNode;
}

export function ControlLabel({ id, children }: ControlLabelProps) {
  return (
    <span id={id} className={styles.label}>
      {children}
    </span>
  );
}
