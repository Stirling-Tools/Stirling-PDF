import type { ReactNode } from "react";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import styles from "@app/components/tools/sign/createSignature/TransparentPreview.module.css";

interface TransparentPreviewProps {
  src: string | null;
  label: string;
  overlay?: ReactNode;
}

export function TransparentPreview({
  src,
  label,
  overlay,
}: TransparentPreviewProps) {
  return (
    <div className={styles.preview} role="img" aria-label={label}>
      {src && (
        <PrivateContent>
          <img className={styles.image} src={src} alt="" />
        </PrivateContent>
      )}
      {overlay && <span className={styles.overlay}>{overlay}</span>}
    </div>
  );
}
