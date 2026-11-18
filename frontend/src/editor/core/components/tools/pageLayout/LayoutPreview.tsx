import { PageLayoutParameters } from "@editor/hooks/tools/pageLayout/usePageLayoutParameters";
import { computeBoxes } from "@editor/components/tools/pageLayout/utils/computeBoxes";

export default function LayoutPreview({
  parameters,
  firstPageDataUrl,
}: {
  parameters: PageLayoutParameters;
  firstPageDataUrl?: string | null;
}) {
  const sheet = {
    x: 0,
    y: 0,
    width: parameters.orientation === "LANDSCAPE" ? 297 : 210,
    height: parameters.orientation === "LANDSCAPE" ? 210 : 297,
  };

  const boxes = computeBoxes(sheet, parameters);
  const aspectRatio = sheet.width / sheet.height;

  return (
    // icon-lint-allow: runtime-generated-svg -- page grid is computed from the layout settings
    <svg
      viewBox={`${sheet.x} ${sheet.y} ${sheet.width} ${sheet.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width:
          parameters.orientation === "PORTRAIT"
            ? "50%"
            : `${50 * aspectRatio}%`,
        aspectRatio: `${aspectRatio}`,
        display: "block",
        margin: "0 auto",
        padding: "10px",
      }}
    >
      <rect
        x={sheet.x}
        y={sheet.y}
        width={sheet.width}
        height={sheet.height}
        rx={4}
        ry={4}
        fill="white"
        stroke="black"
        strokeWidth={2}
      />
      {boxes.map((box) => (
        <g key={box.label}>
          {firstPageDataUrl ? (
            <>
              <image
                href={firstPageDataUrl}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                preserveAspectRatio="xMidYMid meet"
              />
              {parameters.addBorder && (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={3}
                  ry={3}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              )}
              <rect
                x={box.x + 4}
                y={box.y + 4}
                width={Math.max(18, Math.min(box.width, box.height) * 0.24)}
                height={Math.max(18, Math.min(box.width, box.height) * 0.24)}
                rx={3}
                ry={3}
                fill="rgba(29, 78, 216, 0.85)"
              />
              <text
                x={
                  box.x +
                  4 +
                  Math.max(18, Math.min(box.width, box.height) * 0.24) / 2
                }
                y={
                  box.y +
                  4 +
                  Math.max(18, Math.min(box.width, box.height) * 0.24) / 2
                }
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.max(11, Math.min(box.width, box.height) * 0.15)}
                fill="#ffffff"
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
              >
                {box.label}
              </text>
            </>
          ) : (
            <>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={3}
                ry={3}
                fill="#bfdbfe"
                stroke={parameters.addBorder ? "#3b82f6" : "none"}
                strokeWidth={2}
              />
              <text
                x={box.x + box.width / 2}
                y={box.y + box.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(box.width, box.height) * 0.6}
                fill="#1d4ed8"
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
              >
                {box.label}
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
