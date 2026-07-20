interface CloudBadgeProps {
  className?: string;
}

/**
 * Stub component for cloud badge (desktop override provides real implementation)
 * In web builds, this returns null since cloud routing is desktop-only
 */
export function CloudBadge(_props: CloudBadgeProps) {
  return null; // Stub - does nothing in web builds
}
