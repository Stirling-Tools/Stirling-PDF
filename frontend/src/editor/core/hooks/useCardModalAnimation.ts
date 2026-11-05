import { useState, useEffect, useCallback } from "react";

export type CardModalPhase =
  | "closed"
  | "entering"
  | "header-open"
  | "open"
  | "closing-body"
  | "closing-header";

const TIMINGS = {
  headerStretch: 220,
  bodyFireDelay: 130,
  bodyDrop: 90,
  textAccordion: 25,
  closeBody: 150,
  closeHeader: 150,
  closeStretch: 140,
} as const;

export { TIMINGS as CARD_MODAL_TIMINGS };

interface UseCardModalAnimationReturn {
  phase: CardModalPhase;
  cardRect: DOMRect | null;
  textExpanded: boolean;
  openModal: (rect: DOMRect) => void;
  closeModal: () => void;
}

export function useCardModalAnimation(): UseCardModalAnimationReturn {
  const [phase, setPhase] = useState<CardModalPhase>("closed");
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [textExpanded, setTextExpanded] = useState(false);

  useEffect(() => {
    if (phase === "entering") {
      const raf = requestAnimationFrame(() => setPhase("header-open"));
      return () => cancelAnimationFrame(raf);
    }
    if (phase === "header-open") {
      const t1 = setTimeout(() => setTextExpanded(true), TIMINGS.textAccordion);
      const t2 = setTimeout(() => setPhase("open"), TIMINGS.bodyFireDelay);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (phase === "closing-body") {
      const t = setTimeout(() => setPhase("closing-header"), TIMINGS.closeBody);
      return () => clearTimeout(t);
    }
    if (phase === "closing-header") {
      const t = setTimeout(() => {
        setPhase("closed");
        setTextExpanded(false);
      }, TIMINGS.closeHeader);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const openModal = useCallback((rect: DOMRect) => {
    setCardRect(rect);
    setPhase("entering");
  }, []);

  const closeModal = useCallback(() => {
    setPhase("closing-body");
  }, []);

  return { phase, cardRect, textExpanded, openModal, closeModal };
}
