import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { polygonArea, polygonPerimeter } from "@app/utils/measurementArea";
import type { Measurement, MeasureScale } from "@app/utils/measurementTypes";
import {
  convertLength,
  convertArea,
  formatMeasurement,
  type LengthUnit,
} from "@app/utils/measurementUnits";

interface Props {
  measurements: Measurement[];
  groups: {id: string; name: string; color: string; lineWidth?: number}[];
  onGroupsChange: (groups: {id: string; name: string; color: string; lineWidth?: number}[]) => void;
  activeGroup: string;
  onActiveGroupChange: (id: string) => void;
  onChangeMeasurementGroup: (id: string, groupId: string) => void;
  onDeleteMeasurement: (id: string) => void;
  onMoveMeasurement: (id: string) => void;
  onSelectMeasurement: (id: string) => void;
  tool: "length" | "rectangle" | "polygon";
  onToolChange: (tool: "length" | "rectangle" | "polygon") => void;
  unit: LengthUnit;
  onUnitChange: (unit: LengthUnit) => void;
  scale: MeasureScale | null;
  onSetScale: (scale: MeasureScale | null) => void;
  onCalibrate: () => void;
  isCalibrating: boolean;
  onClose: () => void;
}

const units: LengthUnit[] = [
  "mm", "cm", "m", "km", "in", "ft", "yd", "mi",
];

export function MeasurementPanel({ measurements, scale, onCalibrate, isCalibrating, onSetScale, unit, onUnitChange, tool, onToolChange, groups, onGroupsChange, activeGroup, onActiveGroupChange, onChangeMeasurementGroup, onDeleteMeasurement, onMoveMeasurement, onSelectMeasurement, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    () => localStorage.getItem("stirling-measure-orientation") === "horizontal"
      ? "horizontal" : "vertical"
  );
  const [panelSizes, setPanelSizes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("stirling-measure-sizes") || "{}");
      return {
        vertical: saved.vertical ?? {width:320,height:650},
        horizontal: saved.horizontal ?? {width:850,height:340}
      };
    } catch {
      return {
        vertical:{width:320,height:650},
        horizontal:{width:850,height:340}
      };
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("stirling-measure-orientation", orientation);
  }, [orientation]);

  useEffect(() => {
    localStorage.setItem("stirling-measure-sizes", JSON.stringify(panelSizes));
  }, [panelSizes]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.style.display === "none") return;
      const width = Math.round(el.offsetWidth);
      const height = Math.round(el.offsetHeight);
      setPanelSizes(prev => {
        const current = prev[orientation];
        if (Math.abs(current.width-width)<2 &&
            Math.abs(current.height-height)<2) return prev;
        return {...prev,[orientation]:{width,height}};
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [orientation]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) =>
    setCollapsedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsPosition, setResultsPosition] = useState({x: 40, y: 120});
  const [exportSelection,setExportSelection] = useState("all");
  const [listMenu,setListMenu] = useState<{id:string;x:number;y:number}|null>(null);
  type FloatItem = {key:string;kind:"group"|"measurement";id:string;x:number;y:number};
  const [floats,setFloats] = useState<FloatItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("stirling-measure-floating-v1") || "[]") as FloatItem[]; }
    catch { return []; }
  });
  const [panelPosition,setPanelPosition] = useState<{x:number;y:number}|null>(() => {
    try { return JSON.parse(localStorage.getItem("stirling-measure-panel-position-v1") || "null"); }
    catch { return null; }
  });
  const dragRef = useRef<{key:string;x:number;y:number;startX:number;startY:number}|null>(null);
  useEffect(() => { localStorage.setItem("stirling-measure-floating-v1",JSON.stringify(floats)); },[floats]);
  useEffect(() => { localStorage.setItem("stirling-measure-panel-position-v1",JSON.stringify(panelPosition)); },[panelPosition]);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const target = d.key === "panel" ? panelRef.current : null;
      const width = target?.offsetWidth ?? 140;
      const height = target?.offsetHeight ?? 45;
      const x = Math.max(0, Math.min(window.innerWidth - Math.min(width, window.innerWidth),
        d.startX + e.clientX - d.x));
      const y = Math.max(0, Math.min(window.innerHeight - Math.min(height, window.innerHeight),
        d.startY + e.clientY - d.y));

      if (d.key === "panel") setPanelPosition({ x, y });
      else if (d.key === "results") setResultsPosition({ x, y });
      else setFloats(prev => prev.map(f => f.key === d.key ? { ...f, x, y } : f));
    };

    const up = () => { dragRef.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("blur", up);
    };
  }, []);

  const startDrag = (e: React.MouseEvent, key: string, x: number, y: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { key, x: e.clientX, y: e.clientY, startX: x, startY: y };
  };
  const detach=(kind:"group"|"measurement",id:string,e:React.MouseEvent)=>{
    e.stopPropagation();
    const key=`${kind}:${id}`;
    setFloats(prev=>prev.some(f=>f.key===key)?prev:[...prev,{key,kind,id,x:Math.max(20,window.innerWidth-650),y:120+prev.length*32}]);
  };
  const attach=(key:string)=>setFloats(prev=>prev.filter(f=>f.key!==key));
  const detachedGroups=new Set(floats.filter(f=>f.kind==="group").map(f=>f.id));
  const detachedMeasurements=new Set(floats.filter(f=>f.kind==="measurement").map(f=>f.id));


  const scaleOptions = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000];

  const selectedRatio = scale?.ratio ?? "";
  const hasScale = !!scale && Number.isFinite(scale.factor) && scale.factor > 0;
  const showLength = (meters: number) => hasScale
    ? formatMeasurement(convertLength(meters, "m", unit), unit, "length") : t("measurementWorkbench.calibrate");
  const showArea = (squareMeters: number) => hasScale
    ? formatMeasurement(convertArea(squareMeters, "m", unit), unit, "area") : t("measurementWorkbench.calibrate");

  const applyRatio = (ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return;

    onSetScale({
      ratio,
      unit: "m",
      factor: ratio * 0.0254 / 72,
    });
  };

  const rows = useMemo(() => {
    const groupCounts: Record<string, number> = {};
    return measurements.map((measurement) => {
    const groupId = measurement.groupId ?? "default";
    const groupName = groups.find(g => g.id === groupId)?.name ?? t("measurementWorkbench.general");
    groupCounts[groupId] = (groupCounts[groupId] ?? 0) + 1;
    const area = (measurement.kind === "area" || measurement.kind === "rectangle") && !!measurement.points?.length;
    const dx = measurement.end.x - measurement.start.x;
    const dy = measurement.end.y - measurement.start.y;
    const pts = measurement.points ?? [];
    const lengthPts = area ? polygonPerimeter(pts) : Math.hypot(dx, dy);
    const areaPts = area ? polygonArea(pts) : 0;
    const source = scale?.unit as LengthUnit | undefined;
    const from = source && units.includes(source) ? source : "m";
    const factor = scale && Number.isFinite(scale.factor) && scale.factor > 0 ? scale.factor : null;
    const meters = factor === null ? 0 : convertLength(lengthPts * factor, from, "m");
    const squareMeters = factor === null ? 0 : convertArea(areaPts * factor * factor, from, "m");
    return { id: measurement.id, groupId: measurement.groupId ?? "default", area, meters, squareMeters,
      label: `${groupName} ${groupCounts[groupId]}` };
    });
  }, [measurements, scale, groups, t]);
  const exportExcel = async () => {
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
      const reportDate = new Date().toLocaleDateString(i18n.language || "en-US");

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
    } catch(error) { console.error("Excel-eksport feilet",error); window.alert(t("measurementWorkbench.exportFailed")); }
  };
  const totalLength = rows.filter(r=>!r.area).reduce((sum,r)=>sum+r.meters,0);
  const totalArea = rows.filter(r=>r.area).reduce((sum,r)=>sum+r.squareMeters,0);

  return (
    <>
    <div ref={panelRef} style={{
      position: "fixed",
      left: panelPosition?.x,
      right: panelPosition ? undefined : 16,
      top: panelPosition?.y ?? 70,
      width: panelSizes[orientation].width,
      height: panelSizes[orientation].height,
      minWidth: 300,
      minHeight: 180,
      maxWidth: "95vw",
      maxHeight: "85vh",
      resize: "both",
      overflow: "auto",
      boxSizing: "border-box",
      background: "var(--c-surface)",
      isolation: "isolate",
      opacity: 1,
      color: "var(--c-text)",
      border: "1px solid var(--c-border)",
      borderRadius: 12,
      padding: 16,
      zIndex: 10000,
      pointerEvents: "auto",
      boxShadow: "0 6px 24px #0006",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14,
      }}>
        <strong onMouseDown={e=>startDrag(e,"panel",panelPosition?.x ?? (window.innerWidth-336),panelPosition?.y ?? 70)} style={{cursor:"move",userSelect:"none",flex:1,padding:"8px 0"}} title={t("measurementWorkbench.drag")}>⠿ {t("measurementWorkbench.measurements")}</strong>
        <button type="button"
          title={orientation==="vertical"?t("measurementWorkbench.horizontal"):t("measurementWorkbench.vertical")}
          onClick={()=>setOrientation(v=>v==="vertical"?"horizontal":"vertical")}
          style={{
            background:"var(--c-surface-raised)",
            color:"var(--c-text)",
            border:"1px solid var(--c-border)",
            borderRadius:6,padding:"6px 10px",cursor:"pointer"
          }}>
          {orientation==="vertical"?"↔":"↕"}
        </button>
        <button type="button" onClick={()=>setResultsOpen(v=>!v)} style={{background:"var(--c-surface-raised)",color:"var(--c-text)",border:"1px solid var(--c-border)",borderRadius:5,padding:6,cursor:"pointer"}}>{t("measurementWorkbench.results")}</button>
        <button type="button" onClick={onClose} title={t("measurementWorkbench.closePanel")} style={{background:"transparent",color:"var(--c-text)",border:0,fontSize:20,cursor:"pointer"}}>×</button>
        <select
          aria-label={t("measurementWorkbench.displayUnit")}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as LengthUnit)}
          style={{
            background: "var(--c-surface-raised)",
            color: "var(--c-text)",
            border: "1px solid var(--c-border)",
            borderRadius: 6,
            padding: 5,
          }}
        >
          {units.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>
      <div style={{
        display: orientation==="horizontal" ? "grid" : "block",
        gridTemplateColumns: orientation==="horizontal"
          ? "repeat(3, minmax(0, 1fr))" : undefined,
        gap: orientation==="horizontal" ? 14 : undefined,
        alignItems:"start"
      }}>
      <div style={{borderBottom:"1px solid var(--c-border)",paddingBottom:12,marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:600,color:"var(--c-text-muted)",marginBottom:7}}>{t("measurementWorkbench.excelExport")}</div>
        <select aria-label={t("measurementWorkbench.selectGroups")} value={exportSelection} onChange={e=>setExportSelection(e.target.value)} style={{width:"100%",padding:7,background:"var(--c-surface-raised)",color:"var(--c-text)",border:"1px solid var(--c-border)",marginBottom:6}}>
          <option value="all">{t("measurementWorkbench.allGroups")}</option>
          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button type="button" onClick={exportExcel} style={{width:"100%",padding:8,background:"var(--c-surface-raised)",border:"1px solid var(--c-border)",borderRadius:7,color:"var(--c-text)",cursor:"pointer",fontSize:12,fontWeight:600}}>{t("measurementWorkbench.download")}</button>
      </div>

      <div style={{
        display: "flex",
        gap: 5,
        marginBottom: 12,
      }}>
        {([
          ["length", t("measurementWorkbench.length")],
          ["rectangle", t("measurementWorkbench.rectangle")],
          ["polygon", t("measurementWorkbench.polygon")],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onToolChange(value)}
            style={{
              flex: 1,
              padding: "9px 3px",
              borderRadius: 6,
              border: tool === value
                ? "1px solid #42a5f5"
                : "1px solid var(--c-border)",
              background: tool === value ? "var(--c-accent-solid)" : "var(--c-surface-raised)",
              color: "var(--c-text)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCalibrate}
        disabled={isCalibrating}
        style={{
          width: "100%",
          padding: "9px 12px",
          marginBottom: 12,
          borderRadius: 6,
          border: "1px solid var(--c-border)",
          background: isCalibrating ? "var(--c-surface-raised)" : "var(--c-surface-raised)",
          color: "var(--c-text)",
          cursor: isCalibrating ? "default" : "pointer",
        }}
      >
        {isCalibrating
          ? t("measurementWorkbench.drawReference")
          : t("measurementWorkbench.calibrateScale")}
      </button>

      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="measurement-scale"
          style={{ display: "block", fontSize: 12, marginBottom: 6 }}
        >
          {t("measurementWorkbench.scale")}
        </label>
        <select
          id="measurement-scale"
          value={selectedRatio}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "") {
              onSetScale(null);
            } else {
              applyRatio(Number(value));
            }
          }}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            background: "var(--c-surface-raised)",
            color: "var(--c-text)",
            border: "1px solid var(--c-border)",
          }}
        >
          <option value="">{t("measurementWorkbench.notSelected")}</option>
          {scaleOptions.map((ratio) => (
            <option key={ratio} value={ratio}>
              1:{ratio}
            </option>
          ))}
          {typeof selectedRatio === "number" &&
            !scaleOptions.includes(selectedRatio) && (
              <option value={selectedRatio}>
                1:{selectedRatio} ({t("measurementWorkbench.custom")})
              </option>
            )}
        </select>
      </div>

      {!scale && (
        <div style={{ fontSize: 12, color: "var(--c-accent-text)", marginBottom: 12 }}>
          {t("measurementWorkbench.scaleWarning")}
        </div>
      )}

      <div style={{borderTop:"1px solid var(--c-border)", paddingTop:10, marginBottom:10}}>
        <div style={{fontWeight:600,marginBottom:6}}>{t("measurementWorkbench.activeGroup")}</div>
        <select value={activeGroup} onChange={e=>onActiveGroupChange(e.target.value)} style={{width:"100%",background:"var(--c-surface-raised)",opacity:1,color:"var(--c-text)",padding:7}}>
          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:5}}>{t("measurementWorkbench.groupHelp")}</div>
        <button type="button" onClick={()=>{
          const name = window.prompt(t("measurementWorkbench.newGroupName"));
          if (!name?.trim()) return;
          const id = `group-${Date.now()}`;
          const colors = ["#299bff","#ff9e44","#35d29a","#c98cff","#ff6584","#e6cb42"];
          onGroupsChange([...groups,{id,name:name.trim(),color:colors[groups.length%colors.length],lineWidth:2}]);
          onActiveGroupChange(id);
        }} style={{marginTop:6,padding:6,background:"var(--c-surface-raised)",opacity:1,color:"var(--c-text)",border:"1px solid var(--c-border)",borderRadius:5}}>{t("measurementWorkbench.newGroup")}</button>
      </div>
      {groups.map(group => {
        const own = rows.filter(r=>r.groupId===group.id);
        if(detachedGroups.has(group.id)) return null;
        return <div key={group.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData("text/measurement-id");if(id)onChangeMeasurementGroup(id,group.id);}} style={{marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <input type="color" aria-label={`${t("measurementWorkbench.color")} ${group.name}`} value={group.color} onChange={e=>onGroupsChange(groups.map(g=>g.id===group.id?{...g,color:e.target.value}:g))} style={{width:28,height:26,padding:0,border:0,background:"transparent"}}/>
            <button type="button"
          onClick={()=>toggleGroup(group.id)}
          style={{background:"transparent",border:0,color:"var(--c-text)",
            cursor:"pointer",fontWeight:700,textAlign:"left"}}>
          {collapsedGroups.includes(group.id)?"▸":"▾"} {group.name}
        </button><button type="button" title={t("measurementWorkbench.detachGroup")} onClick={e=>detach("group",group.id,e)} style={{background:"transparent",color:"var(--c-text-muted)",border:0,cursor:"pointer"}}>↗</button><span style={{opacity:.65}}>({own.length})</span>
            <select aria-label={`${t("measurementWorkbench.lineWidth")} ${group.name}`} title={t("measurementWorkbench.lineWidth")} value={group.lineWidth ?? 2}
              onChange={e=>onGroupsChange(groups.map(g=>g.id===group.id?{...g,lineWidth:Number(e.target.value)}:g))}
              style={{marginLeft:"auto",background:"var(--c-surface-raised)",opacity:1,color:"var(--c-text)",border:"1px solid var(--c-border)",borderRadius:4,padding:3,fontSize:11}}>
              <option value={1}>0,5×</option>
              <option value={2}>{t("measurementWorkbench.standard")}</option>
              <option value={3}>1,5×</option>
              <option value={4}>2×</option>
              <option value={6}>3×</option>
            </select>
          </div>
          {!collapsedGroups.includes(group.id) && own.filter(row=>!detachedMeasurements.has(row.id)).map(row=><div key={row.id} draggable onDragStart={e=>{e.dataTransfer.setData("text/measurement-id",row.id);e.dataTransfer.effectAllowed="move";}} onClick={()=>onSelectMeasurement(row.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setListMenu({id:row.id,x:e.clientX,y:e.clientY});}} style={{cursor:"pointer",padding:"5px 0",borderBottom:"1px solid var(--c-border-subtle)",fontSize:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:6}}><span>{row.label} <small style={{opacity:.7}}>({scale?.ratio ? `1:${scale.ratio}` : t("measurementWorkbench.uncalibratedLower")})</small> <button type="button" title={t("measurementWorkbench.detachMeasurement")} onClick={e=>detach("measurement",row.id,e)} style={{background:"transparent",color:"var(--c-text-muted)",border:0,cursor:"pointer"}}>↗</button></span><b>{row.area ? showArea(row.squareMeters) : showLength(row.meters)}</b></div>
            {row.area && <div style={{opacity:.75}}>{t("measurementWorkbench.perimeter")}: {showLength(row.meters)}</div>}
            <select aria-label={`${t("measurementWorkbench.groupFor")} ${row.label}`} value={row.groupId} onChange={e=>onChangeMeasurementGroup(row.id,e.target.value)} style={{background:"var(--c-surface-raised)",opacity:1,color:"var(--c-text-muted)",border:"none",fontSize:11}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </div>)}
          {!!own.length && <div style={{fontSize:12,marginTop:5}}>{t("measurementWorkbench.areaSum")}: <b>{showArea(own.reduce((v,r)=>v+r.squareMeters,0))}</b></div>}
        </div>;
      })}
      </div>
      {floats.map(f=>{
        const group=groups.find(g=>g.id===f.id);
        const own=f.kind==="group"?rows.filter(r=>r.groupId===f.id&&!detachedMeasurements.has(r.id)):rows.filter(r=>r.id===f.id);
        if((f.kind==="group"&&!group)||(f.kind==="measurement"&&!own.length)) return null;
        return createPortal(<div key={f.key} style={{position:"fixed",left:f.x,top:f.y,width:270,maxHeight:"55vh",overflowY:"auto",zIndex:100001,background:"var(--c-surface)",color:"var(--c-text)",border:"1px solid var(--c-border)",borderRadius:9,boxShadow:"0 8px 25px #0009",padding:10}}>
          <div onMouseDown={e=>startDrag(e,f.key,f.x,f.y)} style={{cursor:"move",userSelect:"none",display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:"1px solid var(--c-border)"}}><b>⠿ {f.kind==="group"?group?.name:own[0]?.label}</b><button type="button" onMouseDown={e=>e.stopPropagation()} onClick={()=>attach(f.key)} title={t("measurementWorkbench.attachTitle")} style={{color:"var(--c-text)",background:"var(--c-surface-raised)",border:0,borderRadius:4,cursor:"pointer"}}>{t("measurementWorkbench.attach")}</button></div>
          <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(f.kind==="group"){const id=e.dataTransfer.getData("text/measurement-id");if(id)onChangeMeasurementGroup(id,f.id);}}}>
          {own.map(row=><div key={row.id} draggable onDragStart={e=>e.dataTransfer.setData("text/measurement-id",row.id)} onClick={()=>onSelectMeasurement(row.id)} style={{padding:"8px 0",borderBottom:"1px solid var(--c-border-subtle)",cursor:"pointer",fontSize:12}}><div style={{display:"flex",justifyContent:"space-between"}}><span>{row.label}</span><b>{row.area?showArea(row.squareMeters):showLength(row.meters)}</b></div><select value={row.groupId} aria-label={`${t("measurementWorkbench.groupFor")} ${row.label}`} onChange={e=>onChangeMeasurementGroup(row.id,e.target.value)} style={{background:"var(--c-surface-raised)",color:"var(--c-text)",marginTop:5}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button type="button" onClick={()=>onDeleteMeasurement(row.id)} style={{marginLeft:8,color:"var(--c-text)",background:"transparent",border:0,cursor:"pointer"}}>{t("measurementWorkbench.delete")}</button></div>)}
          </div>
        </div>,document.body);
      })}
      {listMenu && createPortal(<div role="menu" onContextMenu={e=>e.preventDefault()} onMouseDown={e=>e.stopPropagation()} style={{position:"fixed",left:Math.max(0,Math.min(listMenu.x,window.innerWidth-240)),top:Math.max(0,Math.min(listMenu.y,window.innerHeight-245)),zIndex:2147483647,backgroundColor:"var(--c-surface)",opacity:1,color:"var(--c-text)",border:"1px solid var(--c-border)",padding:9,borderRadius:7,boxShadow:"0 8px 28px #000c",width:220}}>
        <button type="button" onClick={()=>{onMoveMeasurement(listMenu.id);setListMenu(null);}} style={{display:"block",padding:8,width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",border:0,textAlign:"left",cursor:"pointer"}}>{t("measurementWorkbench.moveMeasurement")}</button>
        <label style={{display:"block",marginTop:8,fontSize:12}}>{t("measurementWorkbench.moveToGroup")}</label>
        <select aria-label={t("measurementWorkbench.moveToGroup")} style={{display:"block",width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",opacity:1,padding:8}} value={rows.find(r=>r.id===listMenu.id)?.groupId ?? "default"} onChange={e=>{onChangeMeasurementGroup(listMenu.id,e.target.value);setListMenu(null);}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button type="button" onClick={()=>{onDeleteMeasurement(listMenu.id);setListMenu(null);}} style={{display:"block",padding:8,width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",border:0,textAlign:"left",marginTop:8,cursor:"pointer"}}>{t("measurementWorkbench.deleteMeasurement")}</button>
        <button type="button" onClick={()=>setListMenu(null)} style={{padding:8,backgroundColor:"transparent",color:"var(--c-text-muted)",border:0,cursor:"pointer"}}>{t("measurementWorkbench.close")}</button>
      </div>,document.body)}
      <div style={{borderTop:"1px solid var(--c-border)",paddingTop:8,fontWeight:700,fontSize:13}}>
        <div>{t("measurementWorkbench.areaTotal")}: {showArea(totalArea)}</div>
        <div>{t("measurementWorkbench.lengthTotal")}: {showLength(totalLength)}</div>
      </div>
    </div>
    {resultsOpen && createPortal(
      <div style={{position:"fixed",left:resultsPosition.x,top:resultsPosition.y,
        width:300,maxHeight:"65vh",overflowY:"auto",zIndex:100003,
        background:"var(--c-surface)",color:"var(--c-text)",border:"1px solid var(--c-border)",
        borderRadius:10,padding:12,boxShadow:"0 8px 25px #0009"}}>
        <div onMouseDown={e=>startDrag(e,"results",resultsPosition.x,resultsPosition.y)}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            cursor:"move",userSelect:"none",borderBottom:"1px solid var(--c-border)",
            paddingBottom:9,marginBottom:9}}>
          <strong>⠿ {t("measurementWorkbench.measurementResults")}</strong>
          <button type="button" onMouseDown={e=>e.stopPropagation()}
            onClick={()=>setResultsOpen(false)}
            style={{background:"transparent",color:"var(--c-text)",border:0,
              fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        {groups.map(group=>{
          const own=rows.filter(r=>r.groupId===group.id);
          if(!own.length) return null;
          return <div key={group.id} style={{marginBottom:12}}>
            <button type="button" onClick={()=>toggleGroup(group.id)}
          style={{width:"100%",textAlign:"left",background:"var(--c-surface-raised)",
            color:group.color,border:"1px solid var(--c-border)",
            borderRadius:5,padding:7,cursor:"pointer"}}>
          {collapsedGroups.includes(group.id)?"▸":"▾"} {group.name} ({own.length})
        </button>
            {!collapsedGroups.includes(group.id) && own.map(row=><div key={row.id}
              onClick={()=>onSelectMeasurement(row.id)}
              style={{display:"flex",justifyContent:"space-between",
                gap:8,padding:"6px 0",borderBottom:"1px solid var(--c-border-subtle)",
                cursor:"pointer",fontSize:12}}>
              <span>{row.label}</span>
              <b>{row.area?showArea(row.squareMeters):showLength(row.meters)}</b>
            </div>)}
          </div>;
        })}
        {!rows.length && <div style={{opacity:.7}}>{t("measurementWorkbench.noneYet")}</div>}
        <div style={{borderTop:"1px solid var(--c-border)",paddingTop:8,fontWeight:700}}>
          <div>{t("measurementWorkbench.areaTotal")}: {showArea(totalArea)}</div>
          <div>{t("measurementWorkbench.lengthTotal")}: {showLength(totalLength)}</div>
        </div>
      </div>, document.body
    )}
    </>
  );
}
