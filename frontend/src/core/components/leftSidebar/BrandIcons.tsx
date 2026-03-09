/** Brand SVG icons. colored=false → inherits currentColor (muted), colored=true → brand color */

interface BrandIconProps {
  colored?: boolean;
  size?: number;
}

// Path from simple-icons, viewBox 0 0 24 24
export function GoogleDriveIcon({ colored, size = 16 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill={colored ? '#4285F4' : 'currentColor'}>
      <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"/>
    </svg>
  );
}

// Path from simple-icons, viewBox 0 0 24 24
export function DropboxIcon({ colored, size = 16 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill={colored ? '#0061FF' : 'currentColor'}>
      <path d="M6 1.807 0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
    </svg>
  );
}

// Single filled cloud path for OneDrive
export function OneDriveIcon({ colored, size = 16 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill={colored ? '#0078D4' : 'currentColor'}>
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
    </svg>
  );
}

export function MobileUploadIcon({ colored, size = 16 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill={colored ? '#6366f1' : 'currentColor'}>
      <path d="M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-4-5.27V17h-2v-3.27L9.41 15.3 8 13.9 12 9.9l4 4-1.41 1.4L13 13.73z"/>
    </svg>
  );
}
