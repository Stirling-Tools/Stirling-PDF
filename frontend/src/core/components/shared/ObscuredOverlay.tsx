import React from 'react';
import styles from '@app/components/shared/ObscuredOverlay/ObscuredOverlay.module.css';

type ObscuredOverlayProps = {
  obscured: boolean;
  overlayMessage?: React.ReactNode;
  buttonText?: string;
  onButtonClick?: () => void;
  children: React.ReactNode;
  // Optional border radius for the overlay container. If undefined, no radius is applied.
  borderRadius?: string | number;
};

export default function ObscuredOverlay({
  obscured,
  overlayMessage,
  buttonText,
  onButtonClick,
  children,
  borderRadius,
}: ObscuredOverlayProps) {
  return (
    <div className={styles.container}>
      {children}
      {obscured && (
        <div
          className={styles.overlay}
          style={{
            ...(borderRadius !== undefined ? { borderRadius } : {}),
          }}
        >
          <div className={styles.overlayContent}>
            {overlayMessage && (
              <div className={styles.overlayMessage}>
                {overlayMessage}
              </div>
            )}
            {buttonText && onButtonClick && (
              <button type="button" onClick={onButtonClick} className={styles.overlayButton}>
                {buttonText}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


