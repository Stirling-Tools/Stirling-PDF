import { forwardRef, type HTMLAttributes } from "react";
import "@app/ui/NavSurface.css";

export interface NavSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Element to render; `section`/`aside`/`nav` when the box is a landmark. */
  as?: "div" | "section" | "aside" | "nav";
}

/**
 * The floating box a sidebar's contents sit in: nav sections, the editor's
 * file rail, the account footer. Surface fill, hairline border, nav radius.
 */
export const NavSurface = forwardRef<HTMLDivElement, NavSurfaceProps>(
  function NavSurface(
    { as: Component = "div", className, children, ...rest },
    ref,
  ) {
    return (
      <Component
        ref={ref}
        className={["sui-nav-surface", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
