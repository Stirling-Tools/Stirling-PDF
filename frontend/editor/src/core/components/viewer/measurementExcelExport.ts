import { convertLength, convertArea, type LengthUnit } from "@app/utils/measurementUnits";
import type { MeasureScale } from "@app/utils/measurementTypes";

interface ExportRow {
  id: string;
  groupId: string;
  area: boolean;
  meters: number;
  squareMeters: number;
  label: string;
}

interface ExportOptions {
  scale: MeasureScale | null;
  rows: ExportRow[];
  groups: { id: string; name: string; color: string; lineWidth?: number }[];
  exportSelection: string;
  unit: LengthUnit;
  t: (key: string) => string;
  language: string;
}

export async function exportMeasurementExcel({
  scale, rows, groups, exportSelection, unit, t, language,
}: ExportOptions) {
    if (!scale || !Number.isFinite(scale.factor) || scale.factor <= 0) {
      window.alert(t("measurementWorkbench.scaleRequired"));
      return;
    }
    if (!rows.length) { window.alert(t("measurementWorkbench.noExport")); return; }
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = t("measurementWorkbench.creator");
      const selected = exportSelection === "all" ? groups : groups.filter(g => g.id === exportSelection);
      const used = new Set<string>();
      const reportDate = new Date().toLocaleDateString(language || "en-US");

      const blend = (hex: string, amount: number) => {
        const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
        return rgb.map(v => Math.round(v + (255 - v) * amount)
          .toString(16).padStart(2, "0")).join("").toUpperCase();
      };

      const navy = "172638";
      const muted = "64748B";
      const lengthFormat = `#,##0.000 "${unit}"`;
      const areaFormat = `#,##0.000 "${unit}²"`;

      for (const group of selected) {
        const own = rows.filter(r => r.groupId === group.id);
        if (!own.length) continue;

        let name = group.name.replace(/[\\/*?:\\[\\]]/g, " ").trim().slice(0, 31) || t("measurementWorkbench.group");
        const base = name;
        let n = 2;
        while (used.has(name.toLowerCase())) {
          name = `${base.slice(0, 27)} ${n++}`;
        }
        used.add(name.toLowerCase());

        const sheet = workbook.addWorksheet(name, {
          pageSetup: {
            paperSize: 9,
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
          },
        });

        sheet.columns = [
          { key: "label", width: 31 },
          { key: "length", width: 20 },
          { key: "area", width: 20 },
          { key: "perimeter", width: 20 },
          { key: "scale", width: 19 },
          { key: "group", width: 25 },
        ];

        const color = /^#[0-9a-fA-F]{6}$/.test(group.color)
          ? group.color.slice(1).toUpperCase() : "299BFF";
        const pale = blend(color, 0.91);
        const paleAlternate = blend(color, 0.96);

        const fill = (argb: string) => ({
          type: "pattern" as const,
          pattern: "solid" as const,
          fgColor: { argb: `FF${argb}` },
        });

        // Rapporttittel
        sheet.mergeCells("A1:F2");
        const title = sheet.getCell("A1");
        title.value = t("measurementWorkbench.reportTitle");
        title.font = {
          name: "Aptos Display", size: 19, bold: true,
          color: { argb: "FFFFFFFF" },
        };
        title.fill = fill(navy);
        title.alignment = { vertical: "middle", indent: 1 };
        sheet.getRow(1).height = 23;
        sheet.getRow(2).height = 21;

        sheet.mergeCells("A3:F3");
        const subtitle = sheet.getCell("A3");
        subtitle.value = `${group.name}  |  Stirling PDF`;
        subtitle.font = {
          name: "Aptos", size: 12, bold: true,
          color: { argb: `FF${navy}` },
        };
        subtitle.fill = fill(pale);
        subtitle.alignment = { vertical: "middle", indent: 1 };
        sheet.getRow(3).height = 29;

        sheet.mergeCells("A5:B5");
        sheet.getCell("A5").value = `${t("measurementWorkbench.date")}: ${reportDate}`;
        sheet.mergeCells("C5:D5");
        sheet.getCell("C5").value = `${t("measurementWorkbench.scale")}: ${scale?.ratio ? `1:${scale.ratio}` : t("measurementWorkbench.uncalibrated")}`;
        sheet.mergeCells("E5:F5");
        sheet.getCell("E5").value = `${t("measurementWorkbench.count")}: ${own.length}`;

        for (const address of ["A5", "C5", "E5"]) {
          const cell = sheet.getCell(address);
          cell.font = {
            name: "Aptos", size: 10,
            color: { argb: `FF${muted}` },
          };
          cell.alignment = { vertical: "middle" };
        }
        sheet.getRow(5).height = 25;

        const headerRow = 7;
        const headings = [
          t("measurementWorkbench.measurementHeading"),
          `${t("measurementWorkbench.lengthHeading")} (${unit})`,
          `${t("measurementWorkbench.areaHeading")} (${unit}²)`,
          `${t("measurementWorkbench.perimeterHeading")} (${unit})`,
          t("measurementWorkbench.scaleHeading"),
          t("measurementWorkbench.groupHeading"),
        ];

        const header = sheet.getRow(headerRow);
        header.values = headings;
        header.height = 31;

        for (let col = 1; col <= 6; col++) {
          const cell = header.getCell(col);
          cell.fill = fill(navy);
          cell.font = {
            name: "Aptos", size: 10, bold: true,
            color: { argb: "FFFFFFFF" },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: col === 1 ? "left" : "center",
            indent: col === 1 ? 1 : 0,
          };
          cell.border = {
            bottom: { style: "medium", color: { argb: `FF${color}` } },
          };
        }

        for (const item of own) {
          const added = sheet.addRow({
            label: item.label,
            length: item.area ? null : convertLength(item.meters, "m", unit),
            area: item.area ? convertArea(item.squareMeters, "m", unit) : null,
            perimeter: item.area ? convertLength(item.meters, "m", unit) : null,
            scale: scale?.ratio ? `1:${scale.ratio}` : t("measurementWorkbench.uncalibrated"),
            group: group.name,
          });

          const rowIndex = added.number;
          added.height = 27;
          const background = (rowIndex - headerRow) % 2 === 0
            ? paleAlternate : "FFFFFF";

          for (let col = 1; col <= 6; col++) {
            const cell = added.getCell(col);
            cell.fill = fill(background);
            cell.font = {
              name: "Aptos", size: 10,
              color: { argb: `FF${navy}` },
              bold: col === 1,
            };
            cell.alignment = {
              vertical: "middle",
              horizontal: col >= 2 && col <= 4 ? "right" : "left",
              indent: col === 1 || col === 6 ? 1 : 0,
            };
            cell.border = {
              bottom: {
                style: "hair",
                color: { argb: "FFE2E8F0" },
              },
            };
          }

          added.getCell(2).numFmt = lengthFormat;
          added.getCell(3).numFmt = areaFormat;
          added.getCell(4).numFmt = lengthFormat;
        }

        const last = headerRow + own.length;
        const total = sheet.addRow({ label: t("measurementWorkbench.grandTotal") });
        total.height = 36;

        for (let col = 1; col <= 6; col++) {
          const cell = total.getCell(col);
          cell.fill = fill(pale);
          cell.font = {
            name: "Aptos", size: 11, bold: true,
            color: { argb: `FF${navy}` },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: col >= 2 && col <= 4 ? "right" : "left",
            indent: col === 1 ? 1 : 0,
          };
          cell.border = {
            top: { style: "medium", color: { argb: `FF${color}` } },
          };
        }

        for (const col of [2, 3, 4]) {
          const letter = String.fromCharCode(64 + col);
          const cell = total.getCell(col);
          cell.value = {
            formula: `SUM(${letter}${headerRow + 1}:${letter}${last})`,
          };
          cell.numFmt = col === 3 ? areaFormat : lengthFormat;
        }

        sheet.autoFilter = {
          from: { row: headerRow, column: 1 },
          to: { row: last, column: 6 },
        };
        sheet.views = [{
          state: "frozen",
          ySplit: headerRow,
          showGridLines: false,
        }];

        sheet.pageSetup.printTitlesRow = "1:7";
        sheet.pageSetup.printArea = `A1:F${total.number}`;
        sheet.headerFooter.oddFooter =
          `&LStirling PDF - ${t("measurementWorkbench.reportTitle")}&R${t("measurementWorkbench.page")} &P ${t("measurementWorkbench.of")} &N`;
      }
      if (!workbook.worksheets.length) {
        window.alert(t("measurementWorkbench.noSelected"));
        return;
      }
      const data = await workbook.xlsx.writeBuffer();
      const blob = new Blob([data as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const filename = `malinger-${new Date().toISOString().slice(0,10)}.xlsx`;
      if ("__TAURI_INTERNALS__" in window) {
        const { showSaveDialog, saveToLocalPath } = await import(
          "../../../desktop/services/localFileSaveService"
        );
        const path = await showSaveDialog(filename);
        if (!path) return;
        const result = await saveToLocalPath(blob, path);
        if (!result.success) throw new Error(result.error || t("measurementWorkbench.saveFailed"));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch(error) { console.error("Excel export failed",error); window.alert(t("measurementWorkbench.exportFailed")); }
  };
