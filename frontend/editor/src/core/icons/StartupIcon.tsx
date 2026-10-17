import type { SVGProps } from "react";

/**
 * The shared root for the startup icons' own markup.
 *
 * Every drawing in `startupIcons.generated.ts` repeats the same viewBox and
 * stroke attributes. Holding them here keeps the bundle carrying them once
 * instead of once per icon, which is what the per-file components cost.
 *
 * The bodies are generated from the repo's own svg files, so `body` is the only
 * prop that reaches the markup and nothing a caller supplies can alter it.
 */
export function StartupIcon({
  body,
  selfPainted = false,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "children"> & {
  body: string;
  selfPainted?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      // A brand mark paints itself, so a stroke would flatten it.
      {...(selfPainted
        ? {}
        : {
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          })}
      {...props}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
