import "@shared/components/SectionDivider.css";

export interface SectionDividerProps {
  /** Vertical margin in px. */
  spacing?: number;
  className?: string;
}

/**
 * Hairline divider used between sidebar groups and inside settings panels.
 * No section label — the prototype's deliberate Supabase pattern is to group
 * via the divider alone, without forcing a category noun onto the surfaces.
 */
export function SectionDivider({
  spacing = 12,
  className,
}: SectionDividerProps) {
  return (
    <div
      className={["sui-divider", className ?? ""].filter(Boolean).join(" ")}
      style={{ margin: `${spacing}px 0` }}
      role="separator"
    />
  );
}
