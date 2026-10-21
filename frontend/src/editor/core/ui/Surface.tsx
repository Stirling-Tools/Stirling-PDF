import { forwardRef, type HTMLAttributes } from "react";
import "@app/ui/Surface.css";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Element to render; `section`/`article`/`aside` when the box is a landmark. */
  as?: "div" | "section" | "article" | "aside";
  /** For a surface in front of another surface: same fill, one step of elevation. */
  raised?: boolean;
}

/** The standard in-page surface: fill, hairline border, shared radius, no shadow. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface(
    { as: Component = "div", raised = false, className, children, ...rest },
    ref,
  ) {
    return (
      <Component
        ref={ref}
        className={[
          "sui-surface",
          raised ? "sui-surface--raised" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
