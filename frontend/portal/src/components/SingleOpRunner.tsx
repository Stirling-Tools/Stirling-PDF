import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
} from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchFeaturedOps,
  runSingleOp,
  type FeaturedOp,
  type OpResultMap,
} from "@portal/api/ops";
import "@portal/components/SingleOpRunner.css";

type Phase = "idle" | "running" | "done" | "error";

interface SingleOpRunnerProps {
  open: boolean;
  onClose: () => void;
  /** Optional pre-selected op id (e.g. carousel deep-link). */
  initialOpId?: string;
}

const SAMPLE_DOCS = [
  "certificate-of-insurance.pdf",
  "loss-run-2025.pdf",
  "invoice-acme-corp-q1.pdf",
  "prior-auth-cigna-12471.pdf",
  "contract-acme-msa-v3.pdf",
];

interface RunResult {
  result: OpResultMap;
  durationMs: number;
  opId: string;
}

export function SingleOpRunner({
  open,
  onClose,
  initialOpId,
}: SingleOpRunnerProps) {
  const { setActiveView } = useView();
  const opsState = useAsync<FeaturedOp[]>(() => fetchFeaturedOps(), []);
  const { data: ops } = opsState;
  const { isLoading: opsIsLoading, isEmpty: opsIsEmpty } =
    useSectionFlags(opsState);

  const [selectedOpId, setSelectedOpId] = useState<string | null>(
    initialOpId ?? null,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [sample, setSample] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default selection once the catalogue loads.
  useEffect(() => {
    if (!selectedOpId && ops && ops.length > 0) {
      setSelectedOpId(ops[0].id);
    }
  }, [ops, selectedOpId]);

  const selectedOp = useMemo<FeaturedOp | null>(
    () => ops?.find((o) => o.id === selectedOpId) ?? null,
    [ops, selectedOpId],
  );

  useEffect(() => {
    if (open) {
      setSelectedOpId(initialOpId ?? ops?.[0]?.id ?? null);
      setPhase("idle");
      setSample(null);
      setRunResult(null);
      setErrorMsg(null);
    }
    // ops is intentionally not in deps — we don't want to reset state when
    // the catalogue arrives while the modal is open.
  }, [open, initialOpId]);

  const pickSample = useCallback(() => {
    if (!ops) return;
    const idx = ops.findIndex((o) => o.id === selectedOpId);
    const safeIdx = idx < 0 ? 0 : idx;
    setSample(SAMPLE_DOCS[safeIdx % SAMPLE_DOCS.length]);
  }, [ops, selectedOpId]);

  async function run() {
    if (!selectedOp) return;
    let activeSample = sample;
    if (!activeSample) {
      pickSample();
      // pickSample updates state; use the synchronously-derived value for the
      // call so we don't race.
      const idx = ops?.findIndex((o) => o.id === selectedOpId) ?? 0;
      activeSample = SAMPLE_DOCS[idx % SAMPLE_DOCS.length];
    }
    setPhase("running");
    setErrorMsg(null);
    try {
      const res = await runSingleOp(selectedOp.id, activeSample);
      setRunResult({ ...res, opId: selectedOp.id });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    setPhase("idle");
    setRunResult(null);
    setErrorMsg(null);
  }

  function buildPipelineWithOp() {
    onClose();
    setActiveView("pipelines");
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSample(file.name);
    else pickSample();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title="Try a PDF operation"
      subtitle="Drop a sample, pick an op, see what Stirling returns."
      footer={
        <>
          <div className="portal-runner__footer-status">
            {phase === "running" && selectedOp && (
              <>
                <span className="portal-runner__spinner" aria-hidden />
                <code>POST {selectedOp.endpoint}</code>
              </>
            )}
            {phase === "done" && (
              <StatusBadge tone="success" size="sm">
                200 OK
              </StatusBadge>
            )}
            {phase === "error" && (
              <StatusBadge tone="danger" size="sm">
                {errorMsg ?? "Failed"}
              </StatusBadge>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {phase === "done" ? (
            <>
              <Button variant="outline" onClick={reset}>
                Run again
              </Button>
              <Button
                variant="gradient"
                onClick={buildPipelineWithOp}
                trailingIcon={<span aria-hidden>→</span>}
              >
                Open the pipeline builder
              </Button>
            </>
          ) : (
            <Button
              variant="gradient"
              onClick={run}
              disabled={phase === "running" || !selectedOp}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {phase === "running" ? "Running…" : "Run operation"}
            </Button>
          )}
        </>
      }
    >
      <div className="portal-runner__layout">
        {/* Left column: file + op picker */}
        <section className="portal-runner__left">
          <div
            className={
              "portal-runner__drop" +
              (dragOver ? " is-armed" : "") +
              (sample ? " has-file" : "")
            }
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="portal-runner__drop-icon" aria-hidden>
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
            <div className="portal-runner__drop-text">
              {sample ? (
                <>
                  <strong>{sample}</strong>
                  <span>Drop again or pick another sample to replace.</span>
                </>
              ) : (
                <>
                  <strong>Drop a PDF here</strong>
                  <span>or use a sample document.</span>
                </>
              )}
            </div>
            <button
              type="button"
              className="portal-runner__sample-btn"
              onClick={pickSample}
            >
              {sample ? "Pick another sample" : "Use a sample"}
            </button>
          </div>

          <div>
            <div className="portal-runner__section-title">Featured ops</div>
            <div className="portal-runner__ops">
              {opsIsLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`op-skel-${i}`}
                    className="portal-runner__op portal-runner__op--skeleton"
                    aria-hidden
                  >
                    <Skeleton width="60%" />
                    <Skeleton width="40%" height="0.625rem" />
                    <Skeleton width="80%" height="0.625rem" />
                  </div>
                ))}
              {opsIsEmpty && (
                <EmptyState
                  size="compact"
                  title="No featured ops yet"
                  description="Once operations are published, they'll show up here."
                />
              )}
              {ops?.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  className={
                    "portal-runner__op" +
                    (selectedOpId === op.id ? " is-selected" : "")
                  }
                  onClick={() => {
                    setSelectedOpId(op.id);
                    if (phase === "done") {
                      setPhase("idle");
                      setRunResult(null);
                    }
                  }}
                  data-accent={op.accent}
                >
                  <span className="portal-runner__op-label">{op.label}</span>
                  <span className="portal-runner__op-endpoint">
                    {op.endpoint}
                  </span>
                  <span className="portal-runner__op-blurb">{op.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right column: state-driven result panel */}
        <section className="portal-runner__right">
          {phase === "idle" && selectedOp && (
            <div className="portal-runner__hint">
              <div className="portal-runner__hint-eyebrow">Ready</div>
              <h3>
                Run <code>{selectedOp.label}</code> on{" "}
                <code>{sample ?? "a sample"}</code>
              </h3>
              <p>
                {selectedOp.blurb}. Press <kbd>Run operation</kbd> to invoke{" "}
                <code>POST {selectedOp.endpoint}</code>.
              </p>
            </div>
          )}
          {phase === "running" && selectedOp && (
            <div className="portal-runner__running">
              <div className="portal-runner__spinner-lg" aria-hidden />
              <div className="portal-runner__running-text">
                <div className="portal-runner__running-title">
                  Running {selectedOp.label}…
                </div>
                <code>POST {selectedOp.endpoint}</code>
              </div>
            </div>
          )}
          {phase === "done" && selectedOp && runResult && (
            <div className="portal-runner__result">
              <header className="portal-runner__result-head">
                <StatusBadge tone="success" size="sm">
                  Completed
                </StatusBadge>
                <code>POST {selectedOp.endpoint}</code>
                <span className="portal-runner__result-meta">
                  {runResult.durationMs} ms
                </span>
              </header>
              <pre className="portal-runner__result-code">
                {JSON.stringify(runResult.result, null, 2)}
              </pre>
            </div>
          )}
          {phase === "error" && (
            <div className="portal-runner__hint">
              <div
                className="portal-runner__hint-eyebrow"
                style={{ color: "var(--color-red)" }}
              >
                Failed
              </div>
              <h3>The operation didn&rsquo;t complete</h3>
              <p>{errorMsg ?? "Unknown error"}</p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
