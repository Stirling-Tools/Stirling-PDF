import React from "react";

interface CloudIconProps extends React.SVGProps<SVGSVGElement> {
  colored?: boolean;
}

/**
 * Google Drive icon with brand-color hover support.
 * Pass `colored={true}` to render the official tri-color logo;
 * omit / pass `colored={false}` for a uniform muted/current-color version.
 */
export function GoogleDriveIcon({ colored, ...rest }: CloudIconProps) {
  return (
    <svg viewBox="0 0 87.3 78" width={18} height={18} {...rest}>
      <path
        d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
        fill={colored ? "#0066DA" : "currentColor"}
        opacity={colored ? 1 : 0.5}
      />
      <path
        d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
        fill={colored ? "#00AC47" : "currentColor"}
        opacity={colored ? 1 : 0.4}
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z"
        fill={colored ? "#EA4335" : "currentColor"}
        opacity={colored ? 1 : 0.5}
      />
      <path
        d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z"
        fill={colored ? "#00832D" : "currentColor"}
        opacity={colored ? 1 : 0.45}
      />
      <path
        d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill={colored ? "#2684FC" : "currentColor"}
        opacity={colored ? 1 : 0.55}
      />
      <path
        d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill={colored ? "#FFBA00" : "currentColor"}
        opacity={colored ? 1 : 0.5}
      />
    </svg>
  );
}

/**
 * OneDrive icon with brand-color hover support.
 * FOR FUTURE USE — OneDrive integration is not yet implemented.
 */
export function OneDriveIcon({ colored, ...rest }: CloudIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} {...rest}>
      <path
        d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill={colored ? "#0078D4" : "currentColor"}
        opacity={colored ? 1 : 0.5}
      />
    </svg>
  );
}

/**
 * Dropbox icon with brand-color hover support.
 * FOR FUTURE USE — Dropbox integration is not yet implemented.
 */
export function DropboxIcon({ colored, ...rest }: CloudIconProps) {
  return (
    <svg viewBox="0 0 16 16" width={18} height={18} {...rest}>
      <path
        d="M8.01 4.555L4.005 7.11 8.01 9.665 4.005 12.22 0 9.651l4.005-2.555L0 4.555 4.005 2 8.01 4.555zm-4.026 8.487l4.006-2.555 4.005 2.555-4.005 2.555-4.006-2.555zm4.026-3.39l4.005-2.556L8.01 4.555 11.995 2 16 4.555l-4.005 2.555L16 9.665l-4.005 2.555L8.01 9.652z"
        fill={colored ? "#0061FF" : "currentColor"}
        opacity={colored ? 1 : 0.5}
      />
    </svg>
  );
}
