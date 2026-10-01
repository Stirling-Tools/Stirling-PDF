import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: number;
};

export type Sheet = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function computeBoxes(
  sheet: Sheet,
  parameters: PageLayoutParameters,
): Box[] {
  const { mode, arrangement, readingDirection } = parameters;

  const cols =
    mode === "DEFAULT"
      ? Math.ceil(Math.sqrt(parameters.pagesPerSheet))
      : parameters.cols;
  const rows =
    mode === "DEFAULT"
      ? Math.ceil(parameters.pagesPerSheet / cols)
      : parameters.rows;
  const pagesPerSheet =
    mode === "DEFAULT" ? parameters.pagesPerSheet : cols * rows;

  const boxes: Box[] = [];

  const cellWidth = sheet.width / cols;
  const cellHeight = sheet.height / rows;

  const margin = Math.min(cellWidth, cellHeight) * 0.1;

  for (let i = 0; i < pagesPerSheet; i++) {
    let rowIndex, colIndex;

    if (arrangement === "BY_ROWS") {
      rowIndex = Math.floor(i / cols);
      if (readingDirection === "LTR") {
        colIndex = i % cols;
      } else {
        colIndex = cols - 1 - (i % cols);
      }
    } else {
      rowIndex = i % rows;
      if (readingDirection === "LTR") {
        colIndex = Math.floor(i / rows);
      } else {
        colIndex = cols - 1 - Math.floor(i / rows);
      }
    }
    boxes.push({
      x: sheet.x + colIndex * cellWidth + margin,
      y: sheet.y + rowIndex * cellHeight + margin,
      width: cellWidth - margin * 2,
      height: cellHeight - margin * 2,
      label: i + 1,
    });
  }

  return boxes;
}
