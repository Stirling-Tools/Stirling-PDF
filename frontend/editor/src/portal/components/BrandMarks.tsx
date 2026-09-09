import type { CSSProperties, ReactNode } from "react";
import {
  DropboxIcon,
  GoogleDriveIcon,
  OneDriveIcon,
} from "@app/components/shared/CloudStorageIcons";

/**
 * Full-colour brand marks for the integrations catalogue and source connectors,
 * drawn on a transparent 24x24 canvas (no tinted badge behind them). Vendors
 * with a recognisable mark get their brand geometry and colours; self-hosted or
 * generic entries render neutral currentColor strokes so they follow the theme.
 * Path-exempt from theme-lint's code-colors gate (brand hexes are the point).
 */

interface MarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function Fill({
  size = 20,
  className,
  style,
  children,
  viewBox = "0 0 24 24",
}: MarkProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function Stroke({
  size = 20,
  className,
  style,
  children,
}: MarkProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Brand-coloured marks, keyed by connection-type/source-type id. */
const BRAND: Record<string, (p: MarkProps) => ReactNode> = {
  s3: (p) => (
    <Fill {...p}>
      <path
        d="M5.2 4.5c0-1.2 3-2.1 6.8-2.1s6.8.9 6.8 2.1l-1.5 14.6c-.1 1.5-2.4 2.7-5.3 2.7s-5.2-1.2-5.3-2.7z"
        fill="#E25444"
      />
      <ellipse cx="12" cy="4.5" rx="6.8" ry="2.1" fill="#F2B0AA" />
      <ellipse cx="12" cy="4.7" rx="4.6" ry="1.2" fill="#B8352A" />
    </Fill>
  ),
  sharepoint: (p) => (
    <Fill {...p}>
      <circle cx="10" cy="8.6" r="5.6" fill="#036C70" />
      <circle cx="15.4" cy="13.4" r="4.9" fill="#1A9BA1" />
      <circle cx="9.8" cy="17.2" r="4" fill="#37C6D0" />
    </Fill>
  ),
  purview: (p) => (
    <Fill {...p}>
      <path d="M12 2.6 21.4 12 12 21.4 2.6 12z" fill="#1490DF" />
      <path d="M12 2.6 21.4 12H12z" fill="#28A8EA" />
      <path d="M12 12v9.4L2.6 12z" fill="#0F6CBD" />
    </Fill>
  ),
  box: (p) => (
    <Fill {...p}>
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#0061D5" />
      <path
        d="M8 6.5v11"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle
        cx="12.6"
        cy="13.3"
        r="4.1"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
      />
    </Fill>
  ),
  slack: (p) => (
    <Fill {...p}>
      <rect x="9.6" y="2.2" width="3.4" height="8" rx="1.7" fill="#36C5F0" />
      <circle cx="5.8" cy="8.5" r="1.7" fill="#36C5F0" />
      <rect x="13.8" y="9.6" width="8" height="3.4" rx="1.7" fill="#2EB67D" />
      <circle cx="15.5" cy="5.8" r="1.7" fill="#2EB67D" />
      <rect x="11" y="13.8" width="3.4" height="8" rx="1.7" fill="#ECB22E" />
      <circle cx="18.2" cy="15.5" r="1.7" fill="#ECB22E" />
      <rect x="2.2" y="11" width="8" height="3.4" rx="1.7" fill="#E01E5A" />
      <circle cx="8.5" cy="18.2" r="1.7" fill="#E01E5A" />
    </Fill>
  ),
  teams: (p) => (
    <Fill {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#6264A7" />
      <path
        d="M7.2 9h7v2.2h-2.3v6.6h-2.4v-6.6H7.2z"
        fill="#fff"
        transform="translate(1.3 -0.4)"
      />
    </Fill>
  ),
  discord: (p) => (
    <Fill {...p}>
      <path
        d="M5.6 5.6C7.6 4.6 9.8 4.1 12 4.1s4.4.5 6.4 1.5c1.5 3 2 6.1 1.6 9.4-1.5 1.6-3.4 2.7-5.3 3.2l-1.1-2.2h-3.2l-1.1 2.2c-1.9-.5-3.8-1.6-5.3-3.2-.4-3.3.1-6.4 1.6-9.4z"
        fill="#5865F2"
      />
      <ellipse cx="9.2" cy="11.6" rx="1.35" ry="1.5" fill="#fff" />
      <ellipse cx="14.8" cy="11.6" rx="1.35" ry="1.5" fill="#fff" />
    </Fill>
  ),
  googlechat: (p) => (
    <Fill {...p}>
      <path
        d="M4.5 2.5h13a2.5 2.5 0 0 1 2.5 2.5v16.5l-4.4-4H4.5A2.5 2.5 0 0 1 2 15V5a2.5 2.5 0 0 1 2.5-2.5z"
        fill="#00AC47"
      />
      <path
        d="M7 8.4h10M7 12.1h6.5"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Fill>
  ),
  zapier: (p) => (
    <Fill {...p}>
      <g fill="#FF4F00">
        <rect x="10.6" y="2.5" width="2.8" height="19" rx="1.4" />
        <rect
          x="10.6"
          y="2.5"
          width="2.8"
          height="19"
          rx="1.4"
          transform="rotate(90 12 12)"
        />
        <rect
          x="10.6"
          y="2.5"
          width="2.8"
          height="19"
          rx="1.4"
          transform="rotate(45 12 12)"
        />
        <rect
          x="10.6"
          y="2.5"
          width="2.8"
          height="19"
          rx="1.4"
          transform="rotate(135 12 12)"
        />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="#FF4F00" />
    </Fill>
  ),
  jira: (p) => (
    <Fill {...p}>
      <path
        d="M12 2.4 17 7.4a1.6 1.6 0 0 1 0 2.3L12 14.6 7 9.7a1.6 1.6 0 0 1 0-2.3z"
        fill="#2684FF"
      />
      <path
        d="M12 9.4 17 14.3a1.6 1.6 0 0 1 0 2.3L12 21.6 7 16.6a1.6 1.6 0 0 1 0-2.3z"
        fill="#0052CC"
      />
    </Fill>
  ),
  confluence: (p) => (
    <Fill {...p}>
      <path
        d="M3 16.2c2.7-4.3 5.5-5.9 8.7-4.8 2.1.7 3.8 2.1 7.2 2.7l-1.6 4.4c-3.9-.7-5.9-2.2-7.6-2.8-1.7-.5-3.1.1-4.8 2.6z"
        fill="#2684FF"
      />
      <path
        d="M21 7.8c-2.7 4.3-5.5 5.9-8.7 4.8-2.1-.7-3.8-2.1-7.2-2.7l1.6-4.4c3.9.7 5.9 2.2 7.6 2.8 1.7.5 3.1-.1 4.8-2.6z"
        fill="#0052CC"
      />
    </Fill>
  ),
  nextcloud: (p) => (
    <Fill {...p}>
      <g fill="none" stroke="#0082C9" strokeWidth="2">
        <circle cx="4.9" cy="12" r="2.1" />
        <circle cx="12" cy="12" r="3.4" />
        <circle cx="19.1" cy="12" r="2.1" />
      </g>
    </Fill>
  ),
  splunk: (p) => (
    <Fill {...p}>
      <path d="M6 4.8 18.4 12 6 19.2v-3.4l7-3.8-7-3.8z" fill="#65A637" />
    </Fill>
  ),
  elastic: (p) => (
    <Fill {...p}>
      <path
        d="M4.6 9.3C6.8 5.6 10.9 3.7 15 4.5c2.9.6 5 2.4 5.8 4.8H4.6z"
        fill="#FEC514"
      />
      <rect
        x="3.4"
        y="10.4"
        width="17.2"
        height="3.2"
        rx="1.6"
        fill="#00BFB3"
      />
      <path
        d="M4.6 14.7h16.2c-.8 2.4-2.9 4.2-5.8 4.8-4.1.8-8.2-1.1-10.4-4.8z"
        fill="#1BA9F5"
      />
    </Fill>
  ),
  sumologic: (p) => (
    <Fill {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#000099" />
      <path
        d="M6.5 9.5c1.8-1.4 3.7-1.4 5.5 0s3.7 1.4 5.5 0M6.5 14.5c1.8-1.4 3.7-1.4 5.5 0s3.7 1.4 5.5 0"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </Fill>
  ),
  sendgrid: (p) => (
    <Fill {...p}>
      <rect x="3" y="3" width="6" height="6" fill="#51A9E3" />
      <rect x="9" y="3" width="6" height="6" fill="#1A82E2" />
      <rect x="15" y="3" width="6" height="6" fill="#51A9E3" />
      <rect x="3" y="9" width="6" height="6" fill="#1A82E2" />
      <rect x="9" y="9" width="6" height="6" fill="#51A9E3" />
      <rect x="15" y="9" width="6" height="6" fill="#1A82E2" />
      <rect x="3" y="15" width="6" height="6" fill="#51A9E3" />
      <rect x="9" y="15" width="6" height="6" fill="#1A82E2" />
    </Fill>
  ),
  mailgun: (p) => (
    <Fill {...p}>
      <circle cx="12" cy="12" r="9.5" fill="#ED413E" />
      <circle cx="12" cy="12" r="5.2" fill="#fff" />
      <circle cx="12" cy="12" r="2.2" fill="#ED413E" />
      <circle cx="17.8" cy="12" r="1.3" fill="#ED413E" />
    </Fill>
  ),
  cloudmersive: (p) => (
    <Fill {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#D64541" />
      <path
        d="M15.8 8.6a4.9 4.9 0 1 0 0 6.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Fill>
  ),
  cloudmersiveadvanced: (p) => (
    <Fill {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#B03A37" />
      <path
        d="M15.8 8.6a4.9 4.9 0 1 0 0 6.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16.9" cy="12" r="1.4" fill="#fff" />
    </Fill>
  ),
  presidio: (p) => (
    <Fill {...p}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#6B4EE6" />
      <path
        d="M12 6.2l4.6 2v3.2c0 3-1.9 5-4.6 6.1-2.7-1.1-4.6-3.1-4.6-6.1V8.2z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11.2" r="1.1" fill="#fff" />
    </Fill>
  ),
  clamav: (p) => (
    <Fill {...p}>
      <path
        d="M12 2.8l7.2 3v5.1c0 4.5-3 7.6-7.2 9.3-4.2-1.7-7.2-4.8-7.2-9.3V5.8z"
        fill="#3E8E9E"
      />
      <path
        d="m8.9 11.7 2.2 2.2 4-4"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Fill>
  ),
  consigno: (p) => (
    <Fill {...p}>
      <path
        d="M16.1 3.3a2.35 2.35 0 0 1 3.3 3.3L8.2 17.8 3.6 19l1.2-4.6z"
        fill="#1B2A4A"
      />
      <path
        d="M12.5 20.4c2.4-1.3 4.2-1.3 6.6 0"
        fill="none"
        stroke="#C33E37"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Fill>
  ),
};

/** Neutral currentColor strokes for generic / self-hosted / roadmap entries. */
const NEUTRAL: Record<string, ReactNode> = {
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  webhook: <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  editor: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  api: (
    <>
      <path d="M8.5 4C6.5 4 6 5 6 6.5v2.3C6 10.4 5.4 11.2 4 11.5v1c1.4.3 2 1.1 2 2.7v2.3C6 19 6.5 20 8.5 20" />
      <path d="M15.5 4c2 0 2.5 1 2.5 2.5v2.3c0 1.6.6 2.4 2 2.7v1c-1.4.3-2 1.1-2 2.7v2.3c0 1.5-.5 2.5-2.5 2.5" />
    </>
  ),
  network: (
    <>
      <rect x="2.5" y="4.5" width="9" height="7" rx="1" />
      <rect x="12.5" y="12.5" width="9" height="7" rx="1" />
      <path d="M7 11.5V16h5.5" />
    </>
  ),
  sftp: (
    <>
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
      <path d="M7.5 16.5h.01" />
      <path d="M11 16.5h.01" />
      <path d="M12 10V3.5" />
      <path d="m8.5 6.5 3.5-3 3.5 3" />
    </>
  ),
  email: (
    <>
      <path d="M21 12.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5.5" />
      <path d="M3 12.5h5l2 3h4l2-3h5" />
      <path d="M12 3v6.5" />
      <path d="m9 7 3 3 3-3" />
    </>
  ),
  _default: (
    <>
      <path d="M9 7V3.5" />
      <path d="M15 7V3.5" />
      <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16v4.5" />
    </>
  ),
};

/** One mark for any integration/source id; unknown ids get a neutral plug. */
export function BrandMark({
  id,
  size = 20,
  className,
  style,
}: MarkProps & { id: string }) {
  if (id === "googledrive") {
    return (
      <GoogleDriveIcon
        colored
        width={size}
        height={size}
        className={className}
        style={style}
      />
    );
  }
  if (id === "onedrive") {
    return (
      <OneDriveIcon
        colored
        width={size}
        height={size}
        className={className}
        style={style}
      />
    );
  }
  if (id === "dropbox") {
    return (
      <DropboxIcon
        colored
        width={size}
        height={size}
        className={className}
        style={style}
      />
    );
  }
  const brand = BRAND[id];
  if (brand) return <>{brand({ size, className, style })}</>;
  return (
    <Stroke size={size} className={className} style={style}>
      {NEUTRAL[id] ?? NEUTRAL._default}
    </Stroke>
  );
}
