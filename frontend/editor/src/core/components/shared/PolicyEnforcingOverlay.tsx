export function PolicyEnforcingOverlay(_props: {
  enforcing: boolean;
  progress?: number;
  zIndex?: number;
  /** CSS colour var for the enforcing policy's accent; tints the icon/spinner. */
  accentVar?: string;
  /** Category of the enforcing policy — picks its icon in the real overlay. */
  categoryId?: string;
  /** Shows a dismiss control in the real overlay, so a run that never settles
   *  can't leave the surface underneath permanently unclickable. */
  onDismiss?: () => void;
}) {
  return null;
}
