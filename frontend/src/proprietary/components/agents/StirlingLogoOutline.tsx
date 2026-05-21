/**
 * A temp stirling logo, may change in future.
 */
export function StirlingLogoOutline({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 192 192"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M68.48 102.4 L184.73 6.45 L184.73 96.05 L68.48 192 Z"
        opacity="0.5"
      />
      <path d="M7.26 95.83 L123.37 0 L123.37 89.5 L7.26 185.33 Z" />
    </svg>
  );
}
