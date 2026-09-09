import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLabelName } from "@app/data/labelDisplay";
import {
  fetchProcessingFolderRuns,
  type ProcessingFolderRun,
} from "@app/services/processingFolderApi";
import "@app/components/policies/SweepRunWall.css";

const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];

/** How often the live wall re-reads the runs feed while it is watching. */
const POLL_MS = 2000;

/** Settled-only polls before a finished wall stands down. */
const IDLE_POLLS = 3;

export type SweepCardPhase = "pending" | "running" | "done" | "failed";

export interface SweepWallCard {
  name: string;
  state: SweepCardPhase;
  /** Classification label ids, when the caller reads them off delivered results. */
  labels: string[];
}

/** Fold one poll of the runs feed into the wall's cards; a done card never regresses. */
export function mergeRunsIntoCards(
  prev: SweepWallCard[],
  runs: ProcessingFolderRun[],
): SweepWallCard[] {
  const byName = new Map(prev.map((card) => [card.name, card]));
  const next: SweepWallCard[] = [...prev];
  for (const run of [...runs].reverse()) {
    const name = run.fileName?.trim();
    if (!name) continue;
    const terminal = TERMINAL.includes(run.status);
    const state: SweepCardPhase = !terminal
      ? "running"
      : run.status === "COMPLETED"
        ? "done"
        : "failed";
    const existing = byName.get(name);
    if (!existing) {
      const card: SweepWallCard = { name, state, labels: [] };
      byName.set(name, card);
      next.push(card);
    } else if (existing.state !== state && existing.state !== "done") {
      const index = next.indexOf(existing);
      next[index] = { ...existing, state };
      byName.set(name, next[index]);
    }
  }
  return next;
}

/** The wall itself: every document a sweep took on, lighting up as its run settles.
 *  Pure render over the caller's cards, so it works from any feed. */
export function SweepRunWall({ cards }: { cards: SweepWallCard[] }) {
  const { t } = useTranslation();
  const labelName = useLabelName();
  if (cards.length === 0) return null;
  return (
    <div className="sweep-wall">
      {cards.map((card) => (
        <div
          key={card.name}
          className={`sweep-wall__card sweep-wall__card--${card.state}`}
        >
          <span className="sweep-wall__card-name">{card.name}</span>
          <span className="sweep-wall__card-status">
            {card.state === "running" && (
              <span className="sweep-wall__spin" aria-hidden />
            )}
            {card.state === "pending" &&
              t("processingFolders.wall.waiting", "Queued...")}
            {card.state === "failed" &&
              t("processingFolders.wall.failed", "Failed")}
            {card.state === "done" &&
              (card.labels.length > 0 ? (
                card.labels.map((label) => (
                  <span key={label} className="sweep-wall__chip">
                    {labelName(label)}
                  </span>
                ))
              ) : (
                <>{t("processingFolders.wall.done", "Done")}</>
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface FolderSweepWallProps {
  /** The processing record whose runs to watch; absent renders nothing. */
  policyId?: string;
}

/**
 * A working folder's live sweep, wherever it came from. Polls the runs feed and raises a
 * one-line strip only while runs execute: the grid below already wears each file's badge.
 */
export function FolderSweepWall({ policyId }: FolderSweepWallProps) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SweepWallCard[]>([]);
  const [visible, setVisible] = useState(false);
  const [anyRunning, setAnyRunning] = useState(false);
  // Old terminal runs sit in the feed forever; the wall only wakes for a run
  // it has seen live, so opening a folder never replays finished history.
  const wokeRef = useRef(false);
  const idleRef = useRef(0);

  useEffect(() => {
    setCards([]);
    setVisible(false);
    setAnyRunning(false);
    wokeRef.current = false;
    idleRef.current = 0;
    if (!policyId) return;
    let cancelled = false;
    const tick = async () => {
      const runs = await fetchProcessingFolderRuns(policyId).catch(
        () => [] as ProcessingFolderRun[],
      );
      if (cancelled) return;
      const live = runs.some((run) => !TERMINAL.includes(run.status));
      setAnyRunning(live);
      if (live) {
        wokeRef.current = true;
        idleRef.current = 0;
        setVisible(true);
      }
      if (wokeRef.current) {
        setCards((prev) => mergeRunsIntoCards(prev, runs));
        if (!live && ++idleRef.current >= IDLE_POLLS) {
          wokeRef.current = false;
          setVisible(false);
          setCards([]);
        }
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [policyId]);

  if (!visible || cards.length === 0) return null;
  const settled = cards.filter(
    (card) => card.state === "done" || card.state === "failed",
  ).length;
  return (
    <div className="sweep-wall__panel">
      {anyRunning && <span className="sweep-wall__spin" aria-hidden />}
      <span>{t("processingFolders.wall.title", "Processing this folder")}</span>
      <span className="sweep-wall__panel-count">
        {settled}/{cards.length}
      </span>
    </div>
  );
}
