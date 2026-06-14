/**
 * SnapGuides — renders the pink alignment guide lines shared by the create and
 * edit overlays. Absolutely positioned within the page overlay.
 */
import React from "react";
import type { SnapGuide } from "@app/tools/formFill/formSnapUtils";
import { FORM_COLORS } from "@app/tools/formFill/formFieldColors";

const GUIDE_COLOR = FORM_COLORS.guide;

export function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          style={
            g.orientation === "v"
              ? {
                  position: "absolute",
                  left: g.position,
                  top: 0,
                  width: 1,
                  height: "100%",
                  background: GUIDE_COLOR,
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  top: g.position,
                  left: 0,
                  height: 1,
                  width: "100%",
                  background: GUIDE_COLOR,
                  pointerEvents: "none",
                }
          }
        />
      ))}
    </>
  );
}

export default SnapGuides;
