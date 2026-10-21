import { useCallback, useEffect, useState, type RefObject } from "react";
import type { Measurement } from "../utils/measurementTypes";
import type { MeasurementGroup } from "../utils/measurementRows";
import type { RulerOverlayHandle } from "../components/RulerOverlay";

const DEFAULT_GROUP: MeasurementGroup = {
  id: "default", name: "General", color: "#299bff", lineWidth: 2,
};

type Options = {
  documentName?: string;
  stableId?: string | number | null;
  legacyFileId?: string | number | null;
  measurements: Measurement[];
  overlayRef: RefObject<RulerOverlayHandle | null>;
};

/** Persist per-document measurement groups without owning Stirling's PDF viewer. */
export function useMeasurementGroups({
  documentName, stableId, legacyFileId, measurements, overlayRef,
}: Options) {
  const [measurementGroups, setMeasurementGroups] = useState<MeasurementGroup[]>([{ ...DEFAULT_GROUP }]);
  const [activeMeasurementGroup, setActiveMeasurementGroup] = useState("default");
  const [savedGroupMembership, setSavedGroupMembership] = useState<Record<string, string>>({});
  const [restoredGroupKey, setRestoredGroupKey] = useState<string | null>(null);
  const measurementGroupStorageKey = `stirling-measurement-groups-v3:${documentName ?? stableId ?? "unknown"}`;

  useEffect(() => {
    setRestoredGroupKey(null);
    let saved: {
      groups?: MeasurementGroup[];
      activeGroup?: string;
      membership?: Record<string, string>;
    } = {};
    try {
      const raw = localStorage.getItem(measurementGroupStorageKey)
        ?? localStorage.getItem(`stirling-measurement-groups-v2:${legacyFileId ?? "unknown"}`);
      if (raw) saved = JSON.parse(raw);
    } catch { /* Ignore corrupt or blocked local storage. */ }
    const validGroups = Array.isArray(saved.groups)
      ? saved.groups.filter(g => g && typeof g.id === "string" && typeof g.name === "string" && /^#[0-9a-fA-F]{6}$/.test(g.color))
      : [];
    setMeasurementGroups(validGroups.length ? validGroups : [{ ...DEFAULT_GROUP }]);
    setActiveMeasurementGroup(saved.activeGroup && validGroups.some(g => g.id === saved.activeGroup) ? saved.activeGroup : "default");
    setSavedGroupMembership(saved.membership && typeof saved.membership === "object" ? saved.membership : {});
    setRestoredGroupKey(measurementGroupStorageKey);
  }, [measurementGroupStorageKey, legacyFileId]);

  useEffect(() => {
    if (restoredGroupKey !== measurementGroupStorageKey) return;
    try {
      localStorage.setItem(measurementGroupStorageKey, JSON.stringify({
        groups: measurementGroups,
        activeGroup: activeMeasurementGroup,
        membership: savedGroupMembership,
      }));
    } catch { /* Storage may be unavailable. */ }
  }, [measurementGroupStorageKey, restoredGroupKey, measurementGroups, activeMeasurementGroup, savedGroupMembership]);

  const changeMeasurementGroup = useCallback((id: string, groupId: string) => {
    if (!measurementGroups.some(g => g.id === groupId)) return;
    setSavedGroupMembership(previous => ({ ...previous, [id]: groupId }));
    const updated = overlayRef.current?.getMeasurements().map(m => m.id === id ? { ...m, groupId } : m);
    if (updated) overlayRef.current?.setMeasurements(updated);
  }, [measurementGroups, overlayRef]);

  useEffect(() => {
    if (restoredGroupKey !== measurementGroupStorageKey || !measurements.length) return;
    const restored = measurements.map(m => {
      const groupId = savedGroupMembership[m.id];
      return groupId && measurementGroups.some(g => g.id === groupId) && m.groupId !== groupId
        ? { ...m, groupId } : m;
    });
    if (restored.some((m, i) => m !== measurements[i])) {
      overlayRef.current?.setMeasurements(restored);
    }
  }, [measurements, savedGroupMembership, measurementGroups, restoredGroupKey, measurementGroupStorageKey, overlayRef]);

  return {
    measurementGroups, setMeasurementGroups,
    activeMeasurementGroup, setActiveMeasurementGroup,
    setSavedGroupMembership, changeMeasurementGroup,
  };
}
