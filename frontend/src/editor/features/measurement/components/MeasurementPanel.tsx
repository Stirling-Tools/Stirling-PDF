import { exportMeasurementExcel } from "../utils/measurementExcelExport";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { PanelHeader } from "@editor/ui/PanelHeader";
import { Icon } from "@editor/ui/Icon";
import "./MeasurementPanel.css";
import type { Measurement, MeasureScale } from "../utils/measurementTypes";
import { calculateMeasurementRows, MEASURE_UNITS, SCALE_OPTIONS, GROUP_COLORS, type MeasurementGroup } from "../utils/measurementRows";
import {
  convertLength,
  convertArea,
  formatMeasurement,
  type LengthUnit,
} from "@editor/utils/measurementUnits";

interface Props {
  measurements: Measurement[];
  groups: MeasurementGroup[];
  onGroupsChange: (groups: MeasurementGroup[]) => void;
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
        vertical: saved.vertical ?? {width:300,height:540},
        horizontal: saved.horizontal ?? {width:760,height:300}
      };
    } catch {
      return {
        vertical:{width:300,height:540},
        horizontal:{width:760,height:300}
      };
    }
  });

  useEffect(() => {
    localStorage.setItem("stirling-measure-orientation", orientation);
  }, [orientation]);

  useEffect(() => {
    localStorage.setItem("stirling-measure-sizes", JSON.stringify(panelSizes));
  }, [panelSizes]);

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) =>
    setCollapsedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsPosition, setResultsPosition] = useState({x: 40, y: 120});
  const [exportSelection,setExportSelection] = useState("all");
  const [listMenu,setListMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const [groupMenu, setGroupMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const beginDockDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!docked || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, select, input, a, [role="button"]')) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 12) return;
      cleanup();
      setPanelPosition({ x: Math.max(0, e.clientX - 130), y: Math.max(0, e.clientY - 22) });
      setDocked(false);
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', cleanup);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', cleanup);
  };
  type FloatItem = {key:string;kind:"group"|"measurement";id:string;x:number;y:number};
  const [floats,setFloats] = useState<FloatItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("stirling-measure-floating-v1") || "[]") as FloatItem[]; }
    catch { return []; }
  });
  const [docked, setDocked] = useState(() => localStorage.getItem("stirling-measure-docked") !== "false");
  useEffect(() => localStorage.setItem("stirling-measure-docked", String(docked)), [docked]);
  const [nativeSlot, setNativeSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const refresh = () => setNativeSlot(document.getElementById("stirling-measure-native-slot"));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("stirling-measure-dock-change", { detail: docked }));
    return () => { window.dispatchEvent(new CustomEvent("stirling-measure-dock-change", { detail: false })); };
  }, [docked]);

  const [panelPosition,setPanelPosition] = useState<{x:number;y:number}|null>(() => {
    try { return JSON.parse(localStorage.getItem("stirling-measure-panel-position-v1") || "null"); }
    catch { return null; }
  });
  useEffect(() => { localStorage.setItem("stirling-measure-floating-v1",JSON.stringify(floats)); },[floats]);
  useEffect(() => { localStorage.setItem("stirling-measure-panel-position-v1",JSON.stringify(panelPosition)); },[panelPosition]);
  const detach=(kind:"group"|"measurement",id:string,e:React.MouseEvent)=>{
    e.stopPropagation();
    const key=`${kind}:${id}`;
    setFloats(prev=>prev.some(f=>f.key===key)?prev:[...prev,{key,kind,id,x:Math.max(20,window.innerWidth-650),y:120+prev.length*32}]);
  };
  const attach=(key:string)=>setFloats(prev=>prev.filter(f=>f.key!==key));
  const detachedGroups=new Set(floats.filter(f=>f.kind==="group").map(f=>f.id));
  const detachedMeasurements=new Set(floats.filter(f=>f.kind==="measurement").map(f=>f.id));


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

  const generalName = t("measurementWorkbench.general");
  const rows = useMemo(
    () => calculateMeasurementRows(measurements, groups, scale, generalName),
    [measurements, groups, scale, generalName],
  );
  const exportExcel = () => exportMeasurementExcel({
    scale, rows, groups, exportSelection, unit, t,
    language: i18n.language,
  });

  const rowsByGroup = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const groupRows = grouped.get(row.groupId);
      if (groupRows) groupRows.push(row);
      else grouped.set(row.groupId, [row]);
    }
    return grouped;
  }, [rows]);
  const totalLength = rows.reduce((sum, row) => sum + (row.area ? 0 : row.meters), 0);
  const totalArea = rows.reduce((sum, row) => sum + row.squareMeters, 0);

  const panelContent = (
    <>
      <div className="measurement-panel__header-wrap" onMouseDownCapture={beginDockDrag}>
      <PanelHeader
        className="measurement-panel__drag"
        icon={<Icon name="ruler" size={18} />}
        title={t("measurementWorkbench.measurements")}
        onClose={onClose}
        closeLabel={t("measurementWorkbench.closePanel")}
        actions={
          <div className="measurement-panel__actions">
            <button type="button" onMouseDown={e => e.stopPropagation()}
              title={docked ? "Løsne panel" : "Fest til høyre"}
              aria-label={docked ? "Løsne panel" : "Fest til høyre"}
              onClick={() => setDocked(v => !v)}>{docked ? "↗" : "↘"}</button>
            <button className="measurement-panel__button" type="button"
              title={orientation === "vertical" ? t("measurementWorkbench.horizontal") : t("measurementWorkbench.vertical")}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setOrientation(v => v === "vertical" ? "horizontal" : "vertical")}
            >{orientation === "vertical" ? "↔" : "↕"}</button>

          </div>
        }
      />
      </div>
      <div className="measurement-panel__scroll">
      <div className="measurement-panel__quickbar">
        <button className="measurement-panel__button" type="button"
          onClick={() => setResultsOpen(v => !v)}>{t("measurementWorkbench.results")}</button>
        <select className="measurement-panel__select" aria-label={t("measurementWorkbench.displayUnit")}
          value={unit} onChange={event => onUnitChange(event.target.value as LengthUnit)}>
          {MEASURE_UNITS.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className="measurement-panel__layout" style={{
        display: !docked && orientation==="horizontal" ? "grid" : "block",
        gridTemplateColumns: !docked && orientation==="horizontal"
          ? "repeat(3, minmax(0, 1fr))" : undefined,
        gap: !docked && orientation==="horizontal" ? 9 : undefined,
        alignItems:"start"
      }}>
      <div className="measurement-panel__section">
        <div className="measurement-panel__section-label">{t("measurementWorkbench.excelExport")}</div>
        <select className="measurement-panel__control" aria-label={t("measurementWorkbench.selectGroups")} value={exportSelection} onChange={e=>setExportSelection(e.target.value)}>
          <option value="all">{t("measurementWorkbench.allGroups")}</option>
          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="measurement-panel__control measurement-panel__export" type="button" onClick={exportExcel}>{t("measurementWorkbench.download")}</button>
      </div>

      <div className="measurement-panel__tools">
        {([
          ["length", t("measurementWorkbench.length")],
          ["rectangle", t("measurementWorkbench.rectangle")],
          ["polygon", t("measurementWorkbench.polygon")],
        ] as const).map(([value, label]) => (
          <button
            className="measurement-panel__tool"
            aria-pressed={tool === value}
            key={value}
            type="button"
            onClick={() => onToolChange(value)}

          >
            {label}
          </button>
        ))}
      </div>

      <button
        className="measurement-panel__control measurement-panel__calibrate"
        type="button"
        onClick={onCalibrate}
        disabled={isCalibrating}

      >
        {isCalibrating
          ? t("measurementWorkbench.drawReference")
          : t("measurementWorkbench.calibrateScale")}
      </button>

      <div className="measurement-panel__scale">
        <label
          htmlFor="measurement-scale"

        >
          {t("measurementWorkbench.scale")}
        </label>
        <select className="measurement-panel__select"
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

        >
          <option value="">{t("measurementWorkbench.notSelected")}</option>
          {SCALE_OPTIONS.map((ratio) => (
            <option key={ratio} value={ratio}>
              1:{ratio}
            </option>
          ))}
          {typeof selectedRatio === "number" &&
            !SCALE_OPTIONS.includes(selectedRatio) && (
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

      <div className="measurement-panel__section measurement-panel__groups">
        <div style={{fontWeight:600,marginBottom:6}}>{t("measurementWorkbench.activeGroup")}</div>
        <select className="measurement-panel__select" value={activeGroup} onChange={e=>onActiveGroupChange(e.target.value)}>
          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:5}}>{t("measurementWorkbench.groupHelp")}</div>
        <button className="measurement-panel__button" type="button" onClick={()=>{
          const name = window.prompt(t("measurementWorkbench.newGroupName"));
          if (!name?.trim()) return;
          const id = `group-${Date.now()}`;
          onGroupsChange([...groups,{id,name:name.trim(),color:GROUP_COLORS[groups.length % GROUP_COLORS.length],lineWidth:2}]);
          onActiveGroupChange(id);
        }}>{t("measurementWorkbench.newGroup")}</button>
      </div>
      {groups.map(group => {
        const own = rowsByGroup.get(group.id) ?? [];
        if(detachedGroups.has(group.id)) return null;
        return <div key={group.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData("text/measurement-id");if(id)onChangeMeasurementGroup(id,group.id);}} style={{marginBottom:12}}>
          <div className="measurement-panel__group-header">
            <input type="color" aria-label={`${t("measurementWorkbench.color")} ${group.name}`} value={group.color} onChange={e=>onGroupsChange(groups.map(g=>g.id===group.id?{...g,color:e.target.value}:g))} className="measurement-panel__color"/>
            <button className="measurement-panel__button measurement-panel__group-toggle" type="button"
          onClick={()=>toggleGroup(group.id)}
          onContextMenu={e=>{e.preventDefault();e.stopPropagation();setGroupMenu({id:group.id,x:e.clientX,y:e.clientY});}}
          title="Høyreklikk for å endre gruppenavn"
          >
          {collapsedGroups.includes(group.id)?"▸":"▾"} {group.name}
        </button><button className="measurement-panel__button measurement-panel__detach" type="button" title={t("measurementWorkbench.detachGroup")} onClick={e=>detach("group",group.id,e)}>↗</button><span style={{opacity:.65}}>({own.length})</span>
            <select className="measurement-panel__select measurement-panel__line-width" aria-label={`${t("measurementWorkbench.lineWidth")} ${group.name}`} title={t("measurementWorkbench.lineWidth")} value={group.lineWidth ?? 2}
              onChange={e=>onGroupsChange(groups.map(g=>g.id===group.id?{...g,lineWidth:Number(e.target.value)}:g))}
>
              <option value={1}>0,5×</option>
              <option value={2}>{t("measurementWorkbench.standard")}</option>
              <option value={3}>1,5×</option>
              <option value={4}>2×</option>
              <option value={6}>3×</option>
            </select>
          </div>
          {!collapsedGroups.includes(group.id) && own.filter(row=>!detachedMeasurements.has(row.id)).map(row=><div key={row.id} draggable onDragStart={e=>{e.dataTransfer.setData("text/measurement-id",row.id);e.dataTransfer.effectAllowed="move";}} onClick={()=>onSelectMeasurement(row.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setListMenu({id:row.id,x:e.clientX,y:e.clientY});}} style={{cursor:"pointer",padding:"5px 0",borderBottom:"1px solid var(--c-border-subtle)",fontSize:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:6}}><span>{row.label} <small style={{opacity:.7}}>({scale?.ratio ? `1:${scale.ratio}` : t("measurementWorkbench.uncalibratedLower")})</small> <button className="measurement-panel__button measurement-panel__detach" type="button" title={t("measurementWorkbench.detachMeasurement")} onClick={e=>detach("measurement",row.id,e)}>↗</button></span><b>{row.area ? showArea(row.squareMeters) : showLength(row.meters)}</b></div>
            {row.area && <div style={{opacity:.75}}>{t("measurementWorkbench.perimeter")}: {showLength(row.meters)}</div>}
            <select className="measurement-panel__select" aria-label={`${t("measurementWorkbench.groupFor")} ${row.label}`} value={row.groupId} onChange={e=>onChangeMeasurementGroup(row.id,e.target.value)} style={{background:"var(--c-surface-raised)",opacity:1,color:"var(--c-text-muted)",border:"none",fontSize:11}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </div>)}
          {!!own.length && <div style={{fontSize:12,marginTop:5}}>{t("measurementWorkbench.areaSum")}: <b>{showArea(own.reduce((v,r)=>v+r.squareMeters,0))}</b></div>}
        </div>;
      })}
      </div>
      {floats.map(f=>{
        const group=groups.find(g=>g.id===f.id);
        const own=f.kind==="group"?(rowsByGroup.get(f.id) ?? []).filter(r=>!detachedMeasurements.has(r.id)):rows.filter(r=>r.id===f.id);
        if((f.kind==="group"&&!group)||(f.kind==="measurement"&&!own.length)) return null;
        return createPortal(<Rnd key={f.key} className="measurement-panel__detached"
          position={{x:f.x,y:f.y}} size={{width:270,height:"auto"}} bounds="window"
          enableResizing={false} dragHandleClassName="measurement-panel__detached-handle"
          onDragStop={(_event,data)=>setFloats(prev=>prev.map(item=>item.key===f.key?{...item,x:data.x,y:data.y}:item))}>
          <div className="measurement-panel__detached-handle" style={{cursor:"move",userSelect:"none",display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:"1px solid var(--c-border)"}}><b>⠿ {f.kind==="group"?group?.name:own[0]?.label}</b><button className="measurement-panel__button" type="button" onMouseDown={e=>e.stopPropagation()} onClick={()=>attach(f.key)} title={t("measurementWorkbench.attachTitle")} style={{color:"var(--c-text)",background:"var(--c-surface-raised)",border:0,borderRadius:4,cursor:"pointer"}}>{t("measurementWorkbench.attach")}</button></div>
          <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(f.kind==="group"){const id=e.dataTransfer.getData("text/measurement-id");if(id)onChangeMeasurementGroup(id,f.id);}}}>
          {own.map(row=><div key={row.id} draggable onDragStart={e=>e.dataTransfer.setData("text/measurement-id",row.id)} onClick={()=>onSelectMeasurement(row.id)} style={{padding:"8px 0",borderBottom:"1px solid var(--c-border-subtle)",cursor:"pointer",fontSize:12}}><div style={{display:"flex",justifyContent:"space-between"}}><span>{row.label}</span><b>{row.area?showArea(row.squareMeters):showLength(row.meters)}</b></div><select className="measurement-panel__select" value={row.groupId} aria-label={`${t("measurementWorkbench.groupFor")} ${row.label}`} onChange={e=>onChangeMeasurementGroup(row.id,e.target.value)} style={{background:"var(--c-surface-raised)",color:"var(--c-text)",marginTop:5}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button className="measurement-panel__button" type="button" onClick={()=>onDeleteMeasurement(row.id)} style={{marginLeft:8,color:"var(--c-text)",background:"transparent",border:0,cursor:"pointer"}}>{t("measurementWorkbench.delete")}</button></div>)}
          </div>
        </Rnd>,document.body);
      })}
      {groupMenu && createPortal(
        <div role="menu" onMouseDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}
          style={{position:"fixed",left:Math.max(0,Math.min(groupMenu.x,window.innerWidth-190)),top:Math.max(0,Math.min(groupMenu.y,window.innerHeight-85)),zIndex:2147483647,background:"var(--c-surface)",color:"var(--c-text)",border:"1px solid var(--c-border)",borderRadius:7,padding:6,boxShadow:"0 8px 28px #0005",minWidth:170}}>
          <button type="button" className="measurement-panel__button" style={{width:"100%",textAlign:"left"}}
            onClick={()=>{
              const target = groups.find(g=>g.id===groupMenu.id);
              setGroupMenu(null);
              if (!target) return;
              const next = window.prompt("Nytt gruppenavn",target.name);
              if (next?.trim() && next.trim()!==target.name) {
                onGroupsChange(groups.map(g=>g.id===target.id?{...g,name:next.trim()}:g));
              }
            }}>Endre navn</button>
          <button type="button" className="measurement-panel__button" style={{width:"100%",textAlign:"left",marginTop:4}}
            onClick={()=>setGroupMenu(null)}>Avbryt</button>
        </div>,document.body
      )}
      {listMenu && createPortal(<div role="menu" onContextMenu={e=>e.preventDefault()} onMouseDown={e=>e.stopPropagation()} style={{position:"fixed",left:Math.max(0,Math.min(listMenu.x,window.innerWidth-240)),top:Math.max(0,Math.min(listMenu.y,window.innerHeight-245)),zIndex:2147483647,backgroundColor:"var(--c-surface)",opacity:1,color:"var(--c-text)",border:"1px solid var(--c-border)",padding:9,borderRadius:7,boxShadow:"0 8px 28px #000c",width:220}}>
        <button className="measurement-panel__button" type="button" onClick={()=>{onMoveMeasurement(listMenu.id);setListMenu(null);}} style={{display:"block",padding:8,width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",border:0,textAlign:"left",cursor:"pointer"}}>{t("measurementWorkbench.moveMeasurement")}</button>
        <label style={{display:"block",marginTop:8,fontSize:12}}>{t("measurementWorkbench.moveToGroup")}</label>
        <select className="measurement-panel__select" aria-label={t("measurementWorkbench.moveToGroup")} style={{display:"block",width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",opacity:1,padding:8}} value={rows.find(r=>r.id===listMenu.id)?.groupId ?? "default"} onChange={e=>{onChangeMeasurementGroup(listMenu.id,e.target.value);setListMenu(null);}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button className="measurement-panel__button" type="button" onClick={()=>{onDeleteMeasurement(listMenu.id);setListMenu(null);}} style={{display:"block",padding:8,width:"100%",backgroundColor:"var(--c-surface-raised)",color:"var(--c-text)",border:0,textAlign:"left",marginTop:8,cursor:"pointer"}}>{t("measurementWorkbench.deleteMeasurement")}</button>
        <button className="measurement-panel__button" type="button" onClick={()=>setListMenu(null)} style={{padding:8,backgroundColor:"transparent",color:"var(--c-text-muted)",border:0,cursor:"pointer"}}>{t("measurementWorkbench.close")}</button>
      </div>,document.body)}
      <div style={{borderTop:"1px solid var(--c-border)",paddingTop:8,fontWeight:700,fontSize:13}}>
        <div>{t("measurementWorkbench.areaTotal")}: {showArea(totalArea)}</div>
        <div>{t("measurementWorkbench.lengthTotal")}: {showLength(totalLength)}</div>
      </div>
      </div>
    </>
  );

  return (
    <>
      {docked && nativeSlot
        ? createPortal(
            <div className="measurement-panel measurement-panel--docked measurement-panel--native">
              {panelContent}
            </div>,
            nativeSlot,
          )
        : !docked && (
            <Rnd
              className="measurement-panel measurement-panel--floating-main"
              size={panelSizes[orientation]}
              position={panelPosition ?? { x: Math.max(0, window.innerWidth - panelSizes[orientation].width - 16), y: 70 }}
              minWidth={280}
              minHeight={180}
              maxWidth="95vw"
              maxHeight="85vh"
              bounds="window"
              dragHandleClassName="measurement-panel__drag"
              onDragStop={(_event, data) => setPanelPosition({ x: data.x, y: data.y })}
              onResizeStop={(_event, _direction, element, _delta, position) => {
                setPanelPosition(position);
                setPanelSizes(prev => ({
                  ...prev,
                  [orientation]: { width: element.offsetWidth, height: element.offsetHeight },
                }));
              }}
            >
              {panelContent}
            </Rnd>
          )}
    {resultsOpen && createPortal(
      <Rnd className="measurement-panel__results" position={resultsPosition}
        size={{width:300,height:"auto"}} bounds="window" enableResizing={false}
        dragHandleClassName="measurement-panel__results-handle"
        onDragStop={(_event,data)=>setResultsPosition({x:data.x,y:data.y})}>
        <div className="measurement-panel__results-handle"
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            cursor:"move",userSelect:"none",borderBottom:"1px solid var(--c-border)",
            paddingBottom:9,marginBottom:9}}>
          <strong>⠿ {t("measurementWorkbench.measurementResults")}</strong>
          <button className="measurement-panel__button" type="button" onMouseDown={e=>e.stopPropagation()}
            onClick={()=>setResultsOpen(false)}
            style={{background:"transparent",color:"var(--c-text)",border:0,
              fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        {groups.map(group=>{
          const own=rowsByGroup.get(group.id) ?? [];
          if(!own.length) return null;
          return <div key={group.id} style={{marginBottom:12}}>
            <button className="measurement-panel__button" type="button" onClick={()=>toggleGroup(group.id)}
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
      </Rnd>, document.body
    )}
    </>
  );
}
