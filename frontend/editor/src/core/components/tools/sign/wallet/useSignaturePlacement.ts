import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSignature } from "@app/contexts/SignatureContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";
import {
  FILE_SWITCH_ACTIVATION_DELAY,
  PLACEMENT_ACTIVATION_DELAY,
} from "@app/constants/signConstants";
import type { WalletEntry } from "@app/components/tools/sign/wallet/walletEntry";

const ARM_RETRY_DELAYS = [PLACEMENT_ACTIVATION_DELAY, 600, 1500];

function useRetriedActivation(
  onActivate: () => void,
  isPlacementMode: boolean,
) {
  const placementModeRef = useRef(isPlacementMode);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    placementModeRef.current = isPlacementMode;
  }, [isPlacementMode]);

  const cancel = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const activate = useCallback(() => {
    cancel();
    timers.current = ARM_RETRY_DELAYS.map((delay, attempt) =>
      window.setTimeout(() => {
        if (attempt === 0 || !placementModeRef.current) onActivate();
      }, delay),
    );
  }, [cancel, onActivate]);

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ activate, cancel }), [activate, cancel]);
}

const OVERLAY_SELECTOR = '[role="dialog"], [role="menu"]';

function isOverlayOpen() {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some(
    (overlay) => overlay.getClientRects().length > 0,
  );
}

function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isOverlayOpen()) return;
      event.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onEscape]);
}

function useRearmOnFileSwitch(armed: boolean, onActivate: () => void) {
  const { activeFileIndex } = useViewer();
  const previous = useRef(activeFileIndex);

  useEffect(() => {
    if (activeFileIndex === previous.current) return;
    previous.current = activeFileIndex;
    if (!armed) return;
    const timer = window.setTimeout(onActivate, FILE_SWITCH_ACTIVATION_DELAY);
    return () => window.clearTimeout(timer);
  }, [activeFileIndex, armed, onActivate]);
}

interface SignaturePlacementOptions {
  onParameterChange: <K extends keyof SignParameters>(
    key: K,
    value: SignParameters[K],
  ) => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

export function useSignaturePlacement({
  onParameterChange,
  onActivate,
  onDeactivate,
}: SignaturePlacementOptions) {
  const { isPlacementMode } = useSignature();
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const activation = useRetriedActivation(onActivate, isPlacementMode);

  const arm = useCallback(
    (entry: WalletEntry) => {
      onParameterChange(
        "signatureType",
        entry.type === "canvas" ? "canvas" : "image",
      );
      onParameterChange("signatureData", entry.dataUrl);
      setArmedKey(entry.key);
      activation.activate();
    },
    [activation, onParameterChange],
  );

  const stop = useCallback(() => {
    activation.cancel();
    setArmedKey(null);
    onDeactivate();
    onParameterChange("signatureData", undefined);
  }, [activation, onDeactivate, onParameterChange]);

  useEscapeKey(armedKey !== null, stop);
  useRearmOnFileSwitch(armedKey !== null, onActivate);

  const placingKey = isPlacementMode ? armedKey : null;

  const toggle = useCallback(
    (entry: WalletEntry) => (placingKey === entry.key ? stop() : arm(entry)),
    [arm, placingKey, stop],
  );

  return { placingKey, arm, stop, toggle, rekey: setArmedKey };
}

export type SignaturePlacement = ReturnType<typeof useSignaturePlacement>;

export function useArmDefaultSignature(
  ready: boolean,
  defaultEntry: WalletEntry | null,
  arm: (entry: WalletEntry) => void,
) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready) return;
    done.current = true;
    if (defaultEntry) arm(defaultEntry);
  }, [arm, defaultEntry, ready]);
}
