/**
 * Core stub for Insufficient Credits Modal
 * Desktop build overrides this with actual modal implementation
 */

interface InsufficientCreditsModalProps {
  opened: boolean;
  onClose: () => void;
  toolId?: string;
  requiredCredits?: number;
}

export function InsufficientCreditsModal(_props: InsufficientCreditsModalProps) {
  return null;
}
