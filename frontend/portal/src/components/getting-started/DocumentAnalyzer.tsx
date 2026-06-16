import { useCallback, useEffect, useRef, useState } from "react";
import { Button, StatusBadge } from "@shared/components";
import type { AnalysisStage } from "@portal/api/gettingStarted";

/**
 * Step 2 — upload a test document and watch a simulated analysis run.
 *
 * A real backend would stream per-stage results; here the sequence is driven by
 * deterministic timers so the animated checklist is reproducible (no
 * Math.random / Date.now). Each stage spends `STAGE_MS` running, then resolves
 * to done and the next begins. When the last stage resolves, `onComplete`
 * unlocks the go-live step.
 */

const STAGE_MS = 900;
const SAMPLE_DOC = "invoice-acme-corp-q1.pdf";

type StageState = "pending" | "running" | "done";

export interface DocumentAnalyzerProps {
  stages: AnalysisStage[];
  /** Fired once every stage has resolved. */
  onComplete: () => void;
}

export function DocumentAnalyzer({
  stages,
  onComplete,
}: DocumentAnalyzerProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // -1 = not started, stages.length = finished.
  const [activeIndex, setActiveIndex] = useState(-1);

  // Hold the timer id so a re-drop (restart) can cancel an in-flight sequence.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Advance one stage per tick while a run is in progress.
  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= stages.length) return;
    timerRef.current = setTimeout(() => {
      setActiveIndex((i) => i + 1);
    }, STAGE_MS);
    return clearTimer;
  }, [activeIndex, stages.length, clearTimer]);

  // Fire completion exactly once when the sequence reaches the end.
  useEffect(() => {
    if (activeIndex === stages.length && stages.length > 0) {
      onCompleteRef.current();
    }
  }, [activeIndex, stages.length]);

  useEffect(() => clearTimer, [clearTimer]);

  function startAnalysis(name: string) {
    clearTimer();
    setFileName(name);
    setActiveIndex(0);
    // TODO(backend): POST /v1/getting-started/analyze with the uploaded file;
    // stream real per-stage results instead of the timed simulation.
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    startAnalysis(file ? file.name : SAMPLE_DOC);
  }

  function stageStateOf(index: number): StageState {
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "running";
    return "pending";
  }

  const started = activeIndex >= 0;
  const finished = activeIndex >= stages.length;

  return (
    <div className="portal-gs__analyzer">
      <div
        className={
          "portal-gs__drop" +
          (dragOver ? " is-armed" : "") +
          (fileName ? " has-file" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="portal-gs__drop-icon" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="portal-gs__drop-text">
          {fileName ? (
            <>
              <strong>{fileName}</strong>
              <span>Drop another document to re-run the analysis.</span>
            </>
          ) : (
            <>
              <strong>Drop a test document</strong>
              <span>
                or analyze a sample invoice to see what Stirling does.
              </span>
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startAnalysis(SAMPLE_DOC)}
        >
          {fileName ? "Re-run on sample" : "Analyze a sample"}
        </Button>
      </div>

      {started && (
        <ul className="portal-gs__checklist">
          {stages.map((stage, i) => {
            const state = stageStateOf(i);
            return (
              <li
                key={stage.id}
                className={"portal-gs__check portal-gs__check--" + state}
              >
                <span className="portal-gs__check-mark" aria-hidden>
                  {state === "done" ? (
                    "✓"
                  ) : state === "running" ? (
                    <span className="portal-gs__check-spinner" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="portal-gs__check-text">
                  <strong>{stage.label}</strong>
                  <span>{stage.detail}</span>
                </span>
                {state === "done" && (
                  <StatusBadge tone="success" size="sm">
                    Done
                  </StatusBadge>
                )}
                {state === "running" && (
                  <StatusBadge tone="info" size="sm">
                    Running
                  </StatusBadge>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {finished && (
        <div className="portal-gs__analyzer-done">
          <StatusBadge tone="success">Analysis complete</StatusBadge>
          <span>
            Your pipeline is assembled and ready. Continue to grab an API key.
          </span>
        </div>
      )}
    </div>
  );
}
