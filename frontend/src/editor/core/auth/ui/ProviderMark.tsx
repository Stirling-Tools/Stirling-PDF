import type { CSSProperties } from "react";

import { Icon } from "@app/ui/Icon";
import { oauthIconName } from "@app/auth/ui/oauthIcons";

interface ProviderMarkProps {
  /** Provider icon filename, e.g. "google.svg". */
  file: string;
  /** Accessible name; without one the mark is decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** A sign-in provider's mark: its own artwork where we have it, a neutral glyph otherwise. */
export function ProviderMark({
  file,
  label,
  className,
  style,
}: ProviderMarkProps) {
  const name = oauthIconName(file);
  if (!name) {
    return (
      <Icon
        name="shield-user"
        className={className}
        style={style}
        size="1em"
        title={label}
      />
    );
  }
  return <Icon name={name} className={className} style={style} title={label} />;
}
