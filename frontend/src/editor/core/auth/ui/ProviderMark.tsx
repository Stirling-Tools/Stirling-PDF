import type { CSSProperties } from "react";

import { Icon } from "@app/ui/Icon";
import { oauthIconUrl, hasProviderArtwork } from "@app/auth/ui/oauthIcons";

interface ProviderMarkProps {
  /** Provider icon filename, e.g. "google.svg". */
  file: string;
  className?: string;
  style?: CSSProperties;
}

/** A sign-in provider's mark: its own artwork where we have it, a neutral glyph otherwise. */
export function ProviderMark({ file, className, style }: ProviderMarkProps) {
  if (!hasProviderArtwork(file)) {
    return (
      <Icon name="shield-user" className={className} style={style} size="1em" />
    );
  }
  return (
    <img src={oauthIconUrl(file)} alt="" className={className} style={style} />
  );
}
