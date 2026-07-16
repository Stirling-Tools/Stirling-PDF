// Storybook contrast audit (dev/QA tool). Loads every Storybook story — the
// component library, a proxy for the app surface but ONLY as far as stories
// exist — in the scan frame below and, for each rendered text element, compares
// its OWN text colour to the background colour it sits on. No axe, no full a11y
// tree — just "text colour vs the colour it overlays", deduped per component +
// colour pair. The heavy lifting lives in ./scan; this is the UI shell.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Finding,
  type Progress,
  MAX_ROWS,
  runScan,
} from "@app/ui/contrastAudit/scan";
import { copyToClipboard } from "@app/ui/contrastAudit/copy";
import { FindingsTable } from "@app/ui/contrastAudit/FindingsTable";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  controlGroup,
} from "@app/ui/contrastAudit/styles";

const DEFAULT_THRESHOLD = 2.5;

type Status = "idle" | "scanning" | "done" | "stopped" | "failed";

export function ContrastAuditPanel() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stopRef = useRef(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [oncePerComponent, setOncePerComponent] = useState(true);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<Progress>({
    done: 0,
    total: 0,
    current: "",
  });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
  }, []);

  const scan = useCallback(async () => {
    const iframe = frameRef.current;
    if (!iframe) return;
    stopRef.current = false;
    setStatus("scanning");
    setFindings([]);
    setProgress({ done: 0, total: 0, current: "" });
    const outcome = await runScan(iframe, {
      theme,
      oncePerComponent,
      shouldStop: () => stopRef.current,
      onProgress: setProgress,
      onFindings: setFindings,
    });
    setStatus(outcome);
  }, [theme, oncePerComponent]);

  const shown = findings.filter((f) => f.ratio <= threshold);

  const copyList = () => {
    const header = "ratio\tfg\tbg\tcount\tcomponent";
    const lines = shown.map(
      (f) =>
        `${f.ratio.toFixed(2)}\t${f.fg}\t${f.bg}\t${f.count}\t${f.storyTitle}`,
    );
    copyToClipboard([header, ...lines].join("\n"), () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    // Own background so the panel is self-consistent — Storybook's canvas isn't
    // theme-aware here, so without this, light dark-mode text lands on a light
    // body → invisible.
    <div
      style={{
        maxWidth: 1080,
        color: "var(--c-text, #111)",
        background: "var(--c-bg, #fff)",
        padding: 16,
        borderRadius: 8,
      }}
    >
      <div>
        <h3 style={{ margin: "0 0 2px" }}>Storybook contrast audit</h3>
        <span style={{ opacity: 0.6, fontSize: 13 }}>
          text colour vs. the colour it overlays, across every Storybook story —
          coverage is whatever has a story, not the live app
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          margin: "14px 0 6px",
        }}
      >
        {status === "scanning" ? (
          <button
            type="button"
            style={btnDanger}
            onClick={() => (stopRef.current = true)}
          >
            ■ Stop
          </button>
        ) : (
          <button type="button" style={btnPrimary} onClick={scan}>
            ▶ Scan stories
          </button>
        )}

        <label style={controlGroup}>
          <input
            type="checkbox"
            checked={oncePerComponent}
            disabled={status === "scanning"}
            onChange={(e) => setOncePerComponent(e.target.checked)}
          />
          one variant / component
        </label>

        <label style={controlGroup}>
          <span style={{ opacity: 0.75 }}>theme</span>
          <select
            value={theme}
            disabled={status === "scanning"}
            onChange={(e) => setTheme(e.target.value as "light" | "dark")}
            style={{ fontSize: 13 }}
          >
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
      </div>

      {/* Threshold slider + copy — filter the list to the worst offenders. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "0 0 12px",
          fontSize: 13,
          flexWrap: "wrap",
        }}
      >
        <label style={controlGroup}>
          <span style={{ opacity: 0.75 }}>
            show ratio ≤{" "}
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>
              {threshold.toFixed(1)}:1
            </strong>
          </span>
          <input
            type="range"
            min={1}
            max={4.5}
            step={0.1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 180 }}
          />
        </label>
        <span style={{ opacity: 0.6 }}>
          <strong style={{ color: "var(--c-text, #111)" }}>
            {shown.length}
          </strong>{" "}
          shown · {findings.length} found
        </span>
        <button
          type="button"
          onClick={copyList}
          disabled={shown.length === 0}
          style={{ ...btnGhost(shown.length > 0), marginLeft: "auto" }}
        >
          {copied ? "Copied ✓" : `⧉ Copy ${shown.length} rows`}
        </button>
      </div>

      <div style={{ margin: "6px 0 12px", fontSize: 13 }}>
        {status === "idle" && (
          <span style={{ opacity: 0.7 }}>
            Click “Scan stories” — it steps through each story in the frame
            below and lists every text element whose colour is too close to its
            fill, deduped per component + colour pair.
          </span>
        )}
        {status === "failed" && (
          <span style={{ color: "var(--color-red, #dc2626)" }}>
            Scan couldn’t start — the Storybook preview didn’t boot in time.
            Check the console and try again.
          </span>
        )}
        {(status === "scanning" ||
          status === "done" ||
          status === "stopped") && (
          <div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--c-border, #e5e7eb)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--color-blue, #3b82f6)",
                  transition: "width .2s",
                }}
              />
            </div>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              {status === "scanning" ? "Scanning" : "Scanned"} {progress.done}/
              {progress.total}
              {progress.current ? ` · ${progress.current}` : ""}
              {status === "done" && " · done"}
              {status === "stopped" && " · stopped"}
            </div>
          </div>
        )}
      </div>

      {/* Visible scan frame — must be laid out for getBoundingClientRect. */}
      <iframe
        ref={frameRef}
        title="contrast scan frame"
        style={{
          width: "100%",
          height: 220,
          border: "1px dashed var(--c-border, #ccc)",
          borderRadius: 6,
          marginBottom: 16,
          background: "var(--c-bg, #fff)",
        }}
      />

      {shown.length > 0 && <FindingsTable rows={shown} />}
      {findings.length > 0 && shown.length === 0 && (
        <p style={{ fontSize: 12.5, opacity: 0.65 }}>
          No findings at or below {threshold.toFixed(1)}:1 — raise the slider to
          see more.
        </p>
      )}
      {findings.length >= MAX_ROWS && (
        <p style={{ fontSize: 12.5, opacity: 0.65 }}>
          Capped at the worst {MAX_ROWS} distinct component/colour pairs.
        </p>
      )}
    </div>
  );
}
