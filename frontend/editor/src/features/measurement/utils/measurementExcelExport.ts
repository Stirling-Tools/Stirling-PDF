import JSZip from "jszip";
import { convertLength, convertArea, type LengthUnit } from "@app/utils/measurementUnits";
import type { MeasureScale } from "./measurementTypes";
import type { MeasurementGroup, MeasurementRow } from "./measurementRows";

type Options = { scale: MeasureScale | null; rows: MeasurementRow[]; groups: MeasurementGroup[]; exportSelection: string; unit: LengthUnit; t: (key: string) => string; language: string };

const xml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const column = (index: number) => String.fromCharCode(65 + index);
function cell(row: number, col: number, value: string | number | null, style = 0): string {
  if (value === null) return "";
  const ref = `${column(col)}${row}`;
  if (typeof value === "number") return `<c r="${ref}" s="2"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
}
function formula(row: number, col: number, expression: string, cachedValue: number): string {
  return `<c r="${column(col)}${row}" s="2"><f>${xml(expression)}</f><v>${Number.isFinite(cachedValue) ? cachedValue : 0}</v></c>`;
}
function groupColorStyle(group: MeasurementGroup): string {
  const raw = group.color.replace(/^#/, "").trim();
  const hex = /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : "299BFF";
  return `FF${hex}`;
}
function readableTextColor(argb: string): string {
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  return (0.2126*r + 0.7152*g + 0.0722*b) > 155 ? "FF172638" : "FFFFFFFF";
}
function worksheet(items: MeasurementRow[], group: MeasurementGroup, opts: Options): string {
  const { t, unit, scale, language } = opts;
  const heading = [t("measurementWorkbench.measurementHeading"), `${t("measurementWorkbench.lengthHeading")} (${unit})`, `${t("measurementWorkbench.areaHeading")} (${unit}²)`, `${t("measurementWorkbench.perimeterHeading")} (${unit})`, t("measurementWorkbench.scaleHeading"), t("measurementWorkbench.groupHeading")];
  const rows: string[] = [];
  const add = (index: number, values: (string | number | null)[], style = 0) => rows.push(`<row r="${index}">${values.map((v, c) => cell(index,c,v,style)).join("")}</row>`);
  add(1, [t("measurementWorkbench.reportTitle")], 4);
  add(3, [`${group.name} | Stirling PDF`], 4);
  add(5, [`${t("measurementWorkbench.date")}: ${new Date().toLocaleDateString(language || "en-US")}`, null, `${t("measurementWorkbench.scale")}: ${scale?.ratio ? `1:${scale.ratio}` : t("measurementWorkbench.uncalibrated")}`, null, `${t("measurementWorkbench.count")}: ${items.length}`]);
  add(7, heading, 4);
  items.forEach((item, index) => {
    const length = convertLength(item.meters, "m", unit);
    const area = item.area ? convertArea(item.squareMeters, "m", unit) : null;
    add(index + 8, [item.label, item.area ? null : length, area, item.area ? length : null, scale?.ratio ? `1:${scale.ratio}` : "", group.name], index % 2 ? 0 : 3);
  });
  const total = items.length + 8;
  const totals = [
    items.reduce((sum, item) => sum + (item.area ? 0 : convertLength(item.meters, "m", unit)), 0),
    items.reduce((sum, item) => sum + (item.area ? convertArea(item.squareMeters, "m", unit) : 0), 0),
    items.reduce((sum, item) => sum + (item.area ? convertLength(item.meters, "m", unit) : 0), 0),
  ];
  rows.push(`<row r="${total}">${cell(total,0,t("measurementWorkbench.grandTotal"),4)}${[1,2,3].map(col => formula(total,col,`SUM(${column(col)}8:${column(col)}${total-1})`,totals[col-1])).join("")}</row>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F${total}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols><col min="1" max="1" width="33" customWidth="1"/><col min="2" max="4" width="21" customWidth="1"/><col min="5" max="6" width="24" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A7:F${total-1}"/></worksheet>`;
}
export async function exportMeasurementExcel(opts: Options): Promise<void> {
  const { scale, rows, groups, exportSelection, t } = opts;
  if (!scale || !Number.isFinite(scale.factor) || scale.factor <= 0) { window.alert(t("measurementWorkbench.scaleRequired")); return; }
  if (!rows.length) { window.alert(t("measurementWorkbench.noExport")); return; }
  try {
    const rowsByGroup = new Map<string, typeof rows>();
    for (const row of rows) {
      const items = rowsByGroup.get(row.groupId);
      if (items) items.push(row);
      else rowsByGroup.set(row.groupId, [row]);
    }
    const chosen = (exportSelection === "all" ? groups : groups.filter(g => g.id === exportSelection))
      .map(group => ({ group, items: rowsByGroup.get(group.id) ?? [] })).filter(x => x.items.length);
    if (!chosen.length) { window.alert(t("measurementWorkbench.noSelected")); return; }
    const used = new Set<string>();
    const sheets = chosen.map(({group,items}) => {
      const base = group.name.replace(/[\\/*?:\[\]]/g," ").trim().slice(0,31) || t("measurementWorkbench.group");
      let name = base; let suffix = 2;
      while (used.has(name.toLowerCase())) name = `${base.slice(0,26)} ${suffix++}`;
      used.add(name.toLowerCase());
      return {name, group, contents:worksheet(items,group,opts)};
    });
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
    zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.folder("xl")!.file("workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
    zip.folder("xl/_rels")!.file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.folder("xl")!.file("styles.xml", `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172638"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`);
    // Each sheet uses its own group color for headings and total rows.
    const styleXml = sheets.map((_,i) => {
      return `<xf numFmtId="0" fontId="${i+2}" fillId="${i+4}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`;
    }).join("");
    const stylesFile = zip.file("xl/styles.xml");
    const originalStyles = await stylesFile!.async("string");
    const extraFonts = sheets.map(s => `<font><b/><color rgb="${readableTextColor(groupColorStyle(s.group))}"/><sz val="11"/><name val="Aptos"/></font>`).join("");
    const extraFills = sheets.map(s => `<fill><patternFill patternType="solid"><fgColor rgb="${groupColorStyle(s.group)}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
    const coloredStyles = originalStyles
      .replace('<fonts count="2">', `<fonts count="${2+sheets.length}">`)
      .replace('</fonts>', `${extraFonts}</fonts>`)
      .replace('<fills count="4">', `<fills count="${4+sheets.length}">`)
      .replace('</fills>', `${extraFills}</fills>`)
      .replace('<cellXfs count="4">', `<cellXfs count="${4+sheets.length}">`)
      .replace('</cellXfs>', `${styleXml}</cellXfs>`);
    zip.file("xl/styles.xml", coloredStyles);
    sheets.forEach((s,i)=>zip.folder("xl/worksheets")!.file(`sheet${i+1}.xml`,s.contents.replace(/ s="4"/g, ` s="${i+4}"`)));
    const blob = await zip.generateAsync({type:"blob", compression:"DEFLATE"});
    const filename = `malinger-${new Date().toISOString().slice(0,10)}.xlsx`;
    if ("__TAURI_INTERNALS__" in window) {
      const { showSaveDialog, saveToLocalPath } = await import("../../../desktop/services/localFileSaveService");
      const path = await showSaveDialog(filename);
      if (!path) return;
      const result = await saveToLocalPath(blob,path);
      if (!result.success) throw new Error(result.error || t("measurementWorkbench.saveFailed"));
    } else {
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href=url; anchor.download=filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  } catch (error) { console.error("Excel export failed",error); window.alert(t("measurementWorkbench.exportFailed")); }
}
