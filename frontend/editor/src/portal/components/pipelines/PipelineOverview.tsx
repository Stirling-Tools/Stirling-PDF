import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import { ActionIcon, Button, SegmentedControl } from "@app/ui";
import "@portal/components/pipelines/PipelineOverview.css";

/** Which editing surface is expanded inline: a fixed section, one step, or the picker. */
export type OverviewExpanded =
  | "sources"
  | "trigger"
  | "output"
  | "picker"
  | number
  | null;

export interface OverviewSource {
  id: string;
  name: string;
  /** Short type tag for the kind chip (s3, folder, webhook). */
  type?: string;
  /** One-line detail shown under the name (path, bucket, endpoint). */
  detail?: string;
}

export interface PipelineOverviewProps {
  sources: OverviewSource[];
  triggerLabel: string;
  stepLabels: string[];
  /** Per-step warning annotation (needs upload / defaults / unknown), aligned with stepLabels. */
  stepNotes?: (string | undefined)[];
  /** Per-step one-line parameter summary (e.g. "eng · skip-text"). */
  stepSummaries?: (string | undefined)[];
  outputLabel: string;
  /** Short type tag for the end chip (api, s3, dir). */
  outputKind?: string;
  /** One-line detail shown under the output name. */
  outputDetail?: string;
  outputReady: boolean;
  expanded: OverviewExpanded;
  /** Persists the user's dragged node positions per pipeline (falls back to "new"). */
  layoutKey?: string;
  /** Steps that must remain last (e.g. Add Password); pins their reorder arrows
   * and hides the insert after them. Aligned with stepLabels. */
  stepFinalOnly?: boolean[];
  /** Each step's own tool icon; falls back to the generic dials. */
  stepIcons?: (ReactNode | undefined)[];
  /** Step index a run is currently executing; its node pulses. Null when idle. */
  runningStep?: number | null;
  /** Steps 0..n-1 finished in the current/last run; they wear a green tick. */
  completedSteps?: number;
  /** Step the last run failed on; it wears a red cross. Null when none. */
  failedStep?: number | null;
  /** Whether the page's code panel is open; drives the header toggle state. */
  codeShown?: boolean;
  /** Fired by the header's { } Code toggle. */
  onToggleCode?: () => void;
  onToggleSection: (target: "sources" | "trigger" | "output") => void;
  onSelectStep: (index: number) => void;
  onAddStep: (atIndex?: number) => void;
  onMoveStep: (index: number, delta: number) => void;
  onRemoveStep: (index: number) => void;
  /** Fired when the user flips Flow/Spec/Code, so the page can match its copy. */
  onModeChange?: (mode: OverviewMode) => void;
}

export type OverviewMode = "spec" | "flow";

const MODE_KEY = "stirling.portal.pipelineViewMode";
const LOCK_KEY = "stirling.portal.pipelineFlowLock";
const POS_KEY = "stirling.portal.pipelineFlowPos";

// Storage can throw (private mode); the overview then just uses the defaults.
function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* best effort */
  }
}

/** The persisted view choice, shared with the page hosting the inspector. */
export function storedOverviewMode(): OverviewMode {
  return stored(MODE_KEY, "flow") === "spec" ? "spec" : "flow";
}

interface NodePos {
  x: number;
  y: number;
}

/** Vertical-spine default layout for the free canvas, centred on `spine`.
 * `trigWidth` centres the trigger card on the chain so its wire drops straight. */
function defaultFlowLayout(
  sourceIds: string[],
  stepCount: number,
  spine = 240,
  trigWidth = 150,
): Record<string, NodePos> {
  const pos: Record<string, NodePos> = {};
  pos.trig = { x: spine + 112 - Math.round(trigWidth / 2), y: 16 };
  const n = sourceIds.length;
  sourceIds.forEach((id, i) => {
    pos[`src:${id}`] = {
      x: Math.max(12, spine + (i - (n - 1) / 2) * 190),
      y: 100,
    };
  });
  pos.srcghost = { x: spine, y: 100 };
  for (let i = 0; i < stepCount; i++) {
    pos[`step:${i}`] = { x: spine, y: 224 + i * 124 };
  }
  if (stepCount === 0) pos.stepghost = { x: spine, y: 224 };
  pos.out = { x: spine, y: 224 + Math.max(stepCount, 1) * 124 };
  return pos;
}

/**
 * The builder's single pipeline surface: a runbook-style spec (default) or a
 * flow, both projections of the same state. Every line and node expands in
 * place into the editor that owns it. The flow has two layouts: locked (a tidy
 * auto-arranged spine) and unlocked (drag nodes anywhere, the wires follow).
 */
export function PipelineOverview({
  sources,
  triggerLabel,
  stepLabels,
  stepNotes,
  stepSummaries,
  outputLabel,
  outputKind,
  outputDetail,
  outputReady,
  expanded,
  layoutKey,
  stepFinalOnly,
  stepIcons,
  runningStep,
  completedSteps,
  failedStep,
  codeShown,
  onToggleCode,
  onToggleSection,
  onSelectStep,
  onAddStep,
  onMoveStep,
  onRemoveStep,
  onModeChange,
}: PipelineOverviewProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<OverviewMode>(storedOverviewMode);
  const [locked, setLocked] = useState(
    () => stored(LOCK_KEY, "true") === "true",
  );
  // User-dragged node positions; anything absent flows to the default layout.
  // Persisted per pipeline so a locked layout survives reloads.
  const posKey = `${POS_KEY}.${layoutKey ?? "new"}`;
  const [posOverrides, setPosOverrides] = useState<Record<string, NodePos>>(
    () => {
      try {
        return JSON.parse(stored(posKey, "{}")) as Record<string, NodePos>;
      } catch {
        return {};
      }
    },
  );
  useEffect(() => {
    persist(posKey, JSON.stringify(posOverrides));
  }, [posKey, posOverrides]);

  const stageRef = useRef<HTMLDivElement>(null);
  const edgesRef = useRef<SVGSVGElement>(null);
  const insertsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    el: HTMLElement;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);
  const clickGuardRef = useRef(false);

  function changeMode(next: OverviewMode) {
    setMode(next);
    persist(MODE_KEY, next);
    onModeChange?.(next);
  }

  function toggleLock() {
    setLocked((prev) => {
      persist(LOCK_KEY, String(!prev));
      return !prev;
    });
  }

  // Steps changed shape: remap the index-keyed step positions so nodes keep
  // their spots - removals shift later steps up, inserts shift them down, the
  // reorder arrows swap the pair. Everything else (sources, trigger, output)
  // stays exactly where the user parked it.
  const stepsSignature = stepLabels.join("|");
  const prevLabelsRef = useRef(stepLabels);
  useEffect(() => {
    const prev = prevLabelsRef.current;
    const next = stepLabels;
    if (prev.join("|") === next.join("|")) return;
    prevLabelsRef.current = next;
    setPosOverrides((old) => {
      const remapped: Record<string, NodePos> = {};
      for (const [key, value] of Object.entries(old)) {
        if (!/^step:/.test(key)) remapped[key] = value;
      }
      const stepPos = (i: number) => old[`step:${i}`];
      const put = (i: number, value?: NodePos) => {
        if (value) remapped[`step:${i}`] = value;
      };
      let r = 0;
      while (r < Math.min(prev.length, next.length) && prev[r] === next[r]) {
        r += 1;
      }
      if (next.length === prev.length - 1) {
        for (let i = 0; i < r; i++) put(i, stepPos(i));
        for (let i = r; i < next.length; i++) put(i, stepPos(i + 1));
      } else if (next.length === prev.length + 1) {
        for (let i = 0; i < r; i++) put(i, stepPos(i));
        for (let i = r + 1; i < next.length; i++) put(i, stepPos(i - 1));
      } else {
        for (let i = 0; i < next.length; i++) put(i, stepPos(i));
        const swap =
          next.length === prev.length &&
          r < next.length - 1 &&
          prev[r] === next[r + 1] &&
          prev[r + 1] === next[r];
        if (swap) {
          put(r, stepPos(r + 1));
          put(r + 1, stepPos(r));
        }
      }
      return remapped;
    });
  }, [stepsSignature, stepLabels]);

  // Centre the default spine in the visible canvas (node width 13.5rem = 216px),
  // and measure the trigger pill so its default spot is dead-centre on the chain.
  const [stageW, setStageW] = useState(0);
  const [trigW, setTrigW] = useState(150);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setStageW(el.clientWidth);
      const trig = el.querySelector<HTMLElement>('[data-node="trig"]');
      if (trig && trig.offsetWidth > 0) setTrigW(trig.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const spineLeft =
    stageW > 0 ? Math.max(12, Math.round(stageW / 2) - 112) : 240;

  const defaults = defaultFlowLayout(
    sources.map((s) => s.id),
    stepLabels.length,
    spineLeft,
    trigW,
  );
  const nodePos = (id: string): NodePos =>
    posOverrides[id] ?? defaults[id] ?? { x: 12, y: 12 };

  let maxX = 0;
  let maxY = 0;
  for (const id of Object.keys(defaults)) {
    const p = nodePos(id);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const stageH = Math.max(280, maxY + 140);
  const stageMinW = maxX + 240;

  /** Draw the wires between ports (bottom centre out, top centre in). */
  function drawEdges() {
    const stage = stageRef.current;
    const svg = edgesRef.current;
    if (!stage || !svg) return;
    const port = (id: string, side: "t" | "b") => {
      const el = stage.querySelector<HTMLElement>(`[data-node="${id}"]`);
      if (!el) return null;
      return {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + (side === "b" ? el.offsetHeight : 0),
      };
    };
    const edges: {
      a: string;
      b: string;
      ghost?: boolean;
      insertAt?: number;
    }[] = [];
    const srcIds = sources.length
      ? sources.map((s) => `src:${s.id}`)
      : ["srcghost"];
    const firstStep = stepLabels.length ? "step:0" : "stepghost";
    srcIds.forEach((src, i) => {
      edges.push({ a: "trig", b: src, ghost: true });
      edges.push({
        a: src,
        b: firstStep,
        ghost: src === "srcghost" || stepLabels.length === 0,
        // Only the first source wire carries the insert point, to avoid twins.
        // The empty chain skips it: the ghost card IS the add affordance.
        insertAt: stepLabels.length > 0 && i === 0 ? 0 : undefined,
      });
    });
    for (let i = 0; i < stepLabels.length - 1; i++) {
      edges.push({ a: `step:${i}`, b: `step:${i + 1}`, insertAt: i + 1 });
    }
    if (stepLabels.length) {
      edges.push({
        a: `step:${stepLabels.length - 1}`,
        b: "out",
        // A final-only last step admits nothing after it: no insert point.
        insertAt: stepFinalOnly?.[stepLabels.length - 1]
          ? undefined
          : stepLabels.length,
      });
    } else {
      edges.push({ a: "stepghost", b: "out", ghost: true });
    }

    let html =
      "<defs>" +
      '<marker id="povA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto">' +
      '<path class="portal-overview__ah" d="M0 0 L8 4 L0 8 z"/></marker>' +
      '<marker id="povAg" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto">' +
      '<path class="portal-overview__ahg" d="M0 0 L8 4 L0 8 z"/></marker>' +
      "</defs>";
    let inserts = "";
    for (const edge of edges) {
      const a = port(edge.a, "b");
      const b = port(edge.b, "t");
      if (!a || !b) continue;
      const dy = Math.max(20, Math.abs(b.y - a.y) / 2);
      html +=
        `<path${edge.ghost ? ' class="is-ghost"' : ""}` +
        ` marker-end="url(#${edge.ghost ? "povAg" : "povA"})"` +
        ` d="M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${
          b.y - 4
        }"/>`;
      if (edge.insertAt !== undefined) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        inserts +=
          `<button type="button" class="portal-overview__insert"` +
          ` data-insert-at="${edge.insertAt}"` +
          ` aria-label="${t("portal.pipelines.composer.addTool")}"` +
          ` style="left:${mx - 12}px;top:${my - 12}px">` +
          `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">` +
          `<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
          `</svg></button>`;
      }
    }
    // Reorder arrows ride beside each step node; drawn here so they follow drags.
    for (let i = 0; i < stepLabels.length; i++) {
      const el = stage.querySelector<HTMLElement>(`[data-node="step:${i}"]`);
      if (!el) continue;
      const x = el.offsetLeft + el.offsetWidth + 8;
      const y = el.offsetTop + el.offsetHeight / 2 - 39;
      const arrow = (dir: number, label: string, disabled: boolean) =>
        `<button type="button" class="portal-overview__arrow"` +
        ` data-move-step="${i}" data-dir="${dir}" aria-label="${label}"` +
        (disabled ? " disabled" : "") +
        `>${dir < 0 ? "↑" : "↓"}</button>`;
      inserts +=
        `<span class="portal-overview__nodemove" style="left:${x}px;top:${y}px">` +
        arrow(-1, t("portal.pipelines.composer.moveUp"), upLocked(i)) +
        arrow(1, t("portal.pipelines.composer.moveDown"), downLocked(i)) +
        `<button type="button" class="portal-overview__arrow portal-overview__arrow--remove"` +
        ` data-remove-step="${i}"` +
        ` aria-label="${t("portal.pipelines.composer.removeStep")}">×</button>` +
        `</span>`;
    }
    svg.innerHTML = html;
    if (insertsRef.current) insertsRef.current.innerHTML = inserts;
  }

  useLayoutEffect(() => {
    if (mode === "flow") drawEdges();
  });

  function onNodePointerDown(id: string, e: React.PointerEvent<HTMLElement>) {
    if (locked) return;
    const el = e.currentTarget as HTMLElement;
    const start = nodePos(id);
    dragRef.current = {
      id,
      el,
      sx: e.clientX,
      sy: e.clientY,
      ox: start.x,
      oy: start.y,
      cx: start.x,
      cy: start.y,
      moved: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best effort */
    }
  }

  function onNodePointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    drag.cx = Math.max(4, drag.ox + dx);
    drag.cy = Math.max(4, drag.oy + dy);
    drag.el.style.left = `${drag.cx}px`;
    drag.el.style.top = `${drag.cy}px`;
    drawEdges();
  }

  function onNodePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      clickGuardRef.current = true;
      setPosOverrides((prev) => ({
        ...prev,
        [drag.id]: { x: drag.cx, y: drag.cy },
      }));
    }
  }

  /** Swallows the click that follows a drag so selection only fires on taps. */
  function guardedClick(action: () => void) {
    return () => {
      if (clickGuardRef.current) {
        clickGuardRef.current = false;
        return;
      }
      action();
    };
  }

  // The spec numbers its real lines like the runbook; ghost lines get a "+".
  let lineNo = 0;

  function specLine(
    keyword: string,
    body: ReactNode,
    onClick: () => void,
    opts?: {
      blank?: boolean;
      ghost?: boolean;
      active?: boolean;
      small?: string;
      note?: string;
      actions?: ReactNode;
      running?: boolean;
      done?: boolean;
      failed?: boolean;
    },
  ) {
    const num = opts?.ghost ? "+" : String(++lineNo);
    return (
      <div className="portal-overview__row">
        <Button
          variant="quiet"
          justify="start"
          fullWidth
          className={
            "portal-overview__line" +
            (opts?.ghost ? " portal-overview__line--ghost" : "") +
            (opts?.active ? " portal-overview__line--active" : "")
          }
          onClick={onClick}
        >
          <span className="portal-overview__n">
            {opts?.failed ? (
              <span className="portal-overview__nfail" aria-hidden>
                ✗
              </span>
            ) : opts?.running ? (
              <span className="portal-overview__rundot" aria-hidden />
            ) : opts?.done ? (
              <span className="portal-overview__ndone" aria-hidden>
                ✓
              </span>
            ) : (
              num
            )}
          </span>
          <span className="portal-overview__kw">{keyword}</span>
          <span
            className={
              "portal-overview__val" +
              (opts?.blank ? " portal-overview__val--blank" : "")
            }
          >
            {body}
            {opts?.small ? (
              <span className="portal-overview__small"> {opts.small}</span>
            ) : null}
          </span>
          {opts?.note ? (
            <span className="portal-overview__note">{opts.note}</span>
          ) : null}
          {!opts?.ghost && (
            <span className="portal-overview__edit">
              {t("portal.pipelines.overview.edit")}
            </span>
          )}
        </Button>
        {opts?.actions ? (
          <div className="portal-overview__actions">{opts.actions}</div>
        ) : null}
      </div>
    );
  }

  const lastStep = stepLabels.length - 1;
  const upLocked = (i: number) => i === 0 || Boolean(stepFinalOnly?.[i]);
  const downLocked = (i: number) =>
    i === lastStep || (i + 1 === lastStep && Boolean(stepFinalOnly?.[i + 1]));

  function stepActions(index: number) {
    return (
      <>
        <ActionIcon
          variant="tertiary"
          aria-label={t("portal.pipelines.composer.moveUp")}
          disabled={upLocked(index)}
          onClick={() => onMoveStep(index, -1)}
        >
          <KeyboardArrowUpRoundedIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
        <ActionIcon
          variant="tertiary"
          aria-label={t("portal.pipelines.composer.moveDown")}
          disabled={downLocked(index)}
          onClick={() => onMoveStep(index, 1)}
        >
          <KeyboardArrowDownRoundedIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
        <ActionIcon
          variant="tertiary"
          aria-label={t("portal.pipelines.composer.removeStep")}
          onClick={() => onRemoveStep(index)}
        >
          <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
      </>
    );
  }

  const spec = (
    <div className="portal-overview__spec">
      {sources.length > 0 ? (
        sources.map((source, i) => (
          <span key={source.id}>
            {specLine(
              i === 0
                ? t("portal.pipelines.overview.from")
                : t("portal.pipelines.overview.andFrom"),
              source.name,
              () => onToggleSection("sources"),
              {
                active: expanded === "sources" && i === sources.length - 1,
                small: source.detail,
              },
            )}
          </span>
        ))
      ) : (
        <span>
          {specLine(
            t("portal.pipelines.overview.from"),
            t("portal.pipelines.overview.chooseInput"),
            () => onToggleSection("sources"),
            { blank: true, active: expanded === "sources" },
          )}
        </span>
      )}
      {specLine(
        t("portal.pipelines.overview.when"),
        triggerLabel,
        () => onToggleSection("trigger"),
        { active: expanded === "trigger" },
      )}
      {stepLabels.length === 0 &&
        flowNode(
          `+ ${t("portal.pipelines.overview.chooseToolCta")}`,
          () => onAddStep(),
          "portal-overview__node--step",
          { blank: true, active: expanded === "picker", nodeId: "stepghost" },
        )}
      {stepLabels.map((label, i) => (
        <span key={`${label}-${i}`}>
          {specLine(
            i === 0
              ? t("portal.pipelines.overview.do")
              : t("portal.pipelines.overview.andDo"),
            label,
            () => onSelectStep(i),
            {
              active: expanded === i,
              small: stepSummaries?.[i],
              note: stepNotes?.[i],
              actions: stepActions(i),
              running: runningStep === i,
              done: i < (completedSteps ?? 0) && runningStep !== i,
              failed: failedStep === i,
            },
          )}
        </span>
      ))}
      {stepLabels.length === 0 ? (
        <span>
          {specLine(
            t("portal.pipelines.overview.do"),
            t("portal.pipelines.composer.addTool"),
            () => onAddStep(),
            { blank: true, active: expanded === "picker" },
          )}
        </span>
      ) : (
        specLine(
          t("portal.pipelines.overview.andDo"),
          t("portal.pipelines.composer.addTool"),
          () => onAddStep(),
          { ghost: true, active: expanded === "picker" },
        )
      )}
      {specLine(
        t("portal.pipelines.overview.to"),
        outputReady ? outputLabel : t("portal.pipelines.overview.chooseOutput"),
        () => onToggleSection("output"),
        {
          blank: !outputReady,
          active: expanded === "output",
          small: outputReady ? outputDetail : undefined,
        },
      )}
    </div>
  );

  function flowNode(
    body: ReactNode,
    onClick: () => void,
    cls: string,
    opts?: {
      blank?: boolean;
      active?: boolean;
      nodeId?: string;
      kind?: {
        text: string;
        tone: "default" | "success" | "warning" | "neutral";
      };
      subtitle?: string;
      subtitleWarn?: boolean;
      running?: boolean;
      done?: boolean;
      failed?: boolean;
      icon?: ReactNode;
    },
  ) {
    // Every flow node lives on the canvas; locking only freezes dragging.
    const nodeId = opts?.nodeId;
    const pos = nodeId ? nodePos(nodeId) : null;
    return (
      <Button
        variant="quiet"
        className={
          `portal-overview__node ${cls}` +
          (opts?.blank ? " portal-overview__node--blank" : "") +
          (opts?.active ? " portal-overview__node--active" : "") +
          (opts?.running ? " portal-overview__node--running" : "") +
          (opts?.failed ? " portal-overview__node--failed" : "")
        }
        onClick={guardedClick(onClick)}
        {...(nodeId
          ? {
              "data-node": nodeId,
              style: { left: pos!.x, top: pos!.y },
              onPointerDown: (e: React.PointerEvent<HTMLElement>) =>
                onNodePointerDown(nodeId, e),
              onPointerMove: onNodePointerMove,
              onPointerUp: onNodePointerUp,
            }
          : {})}
      >
        {opts?.failed ? (
          <span className="portal-overview__node-failed" aria-hidden>
            ✗
          </span>
        ) : opts?.done ? (
          <span className="portal-overview__node-done" aria-hidden>
            ✓
          </span>
        ) : null}
        <span className="portal-overview__node-row">
          <span
            className={`portal-overview__node-ico portal-overview__node-ico--${opts?.kind?.tone ?? "default"}`}
            aria-hidden
          >
            {opts?.icon ??
              (cls.includes("--trigger") ? (
                <BoltRoundedIcon />
              ) : cls.includes("--output") ? (
                <SendRoundedIcon />
              ) : cls.includes("--step") ? (
                <TuneRoundedIcon />
              ) : (
                <MoveToInboxRoundedIcon />
              ))}
          </span>
          <span className="portal-overview__node-text">
            {opts?.kind ? (
              <span
                className={`portal-overview__node-kind portal-overview__node-kind--${opts.kind.tone}`}
              >
                {opts.kind.text}
              </span>
            ) : null}
            <span className="portal-overview__node-title">{body}</span>
            {opts?.subtitle ? (
              <span
                className={
                  "portal-overview__node-sub" +
                  (opts.subtitleWarn ? " portal-overview__node-sub--warn" : "")
                }
              >
                {opts.subtitle}
              </span>
            ) : null}
          </span>
        </span>
      </Button>
    );
  }

  const nodes = (
    <>
      {flowNode(
        triggerLabel,
        () => onToggleSection("trigger"),
        "portal-overview__node--trigger",
        {
          active: expanded === "trigger",
          nodeId: "trig",
          kind: {
            text: t("portal.pipelines.overview.kindTrigger"),
            tone: "warning",
          },
        },
      )}
      {sources.length > 0
        ? sources.map((source) => (
            <span key={source.id}>
              {flowNode(
                source.name,
                () => onToggleSection("sources"),
                "portal-overview__node--source",
                {
                  active: expanded === "sources",
                  nodeId: `src:${source.id}`,
                  kind: {
                    text: `${t("portal.pipelines.overview.kindStart")}${source.type ? ` · ${source.type}` : ""}`,
                    tone: "default",
                  },
                  subtitle: source.detail,
                },
              )}
            </span>
          ))
        : flowNode(
            `+ ${t("portal.pipelines.overview.chooseInputCta")}`,
            () => onToggleSection("sources"),
            "portal-overview__node--source",
            { blank: true, active: expanded === "sources", nodeId: "srcghost" },
          )}
      {stepLabels.length === 0 &&
        flowNode(
          `+ ${t("portal.pipelines.overview.chooseToolCta")}`,
          () => onAddStep(),
          "portal-overview__node--step",
          { blank: true, active: expanded === "picker", nodeId: "stepghost" },
        )}
      {stepLabels.map((label, i) => (
        <span key={`${label}-${i}`}>
          {flowNode(
            label,
            () => onSelectStep(i),
            "portal-overview__node--step",
            {
              active: expanded === i,
              nodeId: `step:${i}`,
              kind: {
                text: t("portal.pipelines.overview.stepOf", {
                  n: i + 1,
                  total: stepLabels.length,
                }),
                tone: "neutral",
              },
              subtitle:
                stepNotes?.[i] ??
                stepSummaries?.[i] ??
                t("portal.pipelines.overview.defaultSettings"),
              subtitleWarn: Boolean(stepNotes?.[i]),
              running: runningStep === i,
              done: i < (completedSteps ?? 0) && runningStep !== i,
              failed: failedStep === i,
              icon: stepIcons?.[i],
            },
          )}
        </span>
      ))}
      {flowNode(
        outputReady
          ? outputLabel
          : `+ ${t("portal.pipelines.overview.chooseOutputCta")}`,
        () => onToggleSection("output"),
        "portal-overview__node--output",
        {
          blank: !outputReady,
          active: expanded === "output",
          nodeId: "out",
          kind: {
            text: `${t("portal.pipelines.overview.kindEnd")}${outputKind ? ` · ${outputKind}` : ""}`,
            tone: "success",
          },
          subtitle: outputReady ? outputDetail : undefined,
        },
      )}
    </>
  );

  const flow = (
    <>
      <div className="portal-overview__flowbar">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPosOverrides({})}
        >
          {t("portal.pipelines.overview.autoArrange")}
        </Button>
        <span className="portal-overview__flowhint">
          {locked ? "" : t("portal.pipelines.overview.flowHint")}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={locked}
          onClick={toggleLock}
          leftSection={
            locked ? (
              <LockOutlinedIcon style={{ fontSize: "1rem" }} />
            ) : (
              <LockOpenOutlinedIcon style={{ fontSize: "1rem" }} />
            )
          }
        >
          {locked
            ? t("portal.pipelines.overview.unlockLayout")
            : t("portal.pipelines.overview.lockLayout")}
        </Button>
      </div>
      {
        <div className="portal-overview__canvaswrap">
          <div
            ref={stageRef}
            className={
              "portal-overview__stage" +
              (locked ? " portal-overview__stage--locked" : "")
            }
            style={{ height: stageH, minWidth: stageMinW }}
          >
            <svg
              ref={edgesRef}
              className="portal-overview__edges"
              aria-hidden
            />
            {/* Wire "+" buttons, positioned by drawEdges; one delegated handler. */}
            <div
              ref={insertsRef}
              className="portal-overview__inserts"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const del = target.closest<HTMLElement>("[data-remove-step]");
                if (del) {
                  onRemoveStep(Number(del.dataset.removeStep));
                  return;
                }
                const move = target.closest<HTMLElement>("[data-move-step]");
                if (move) {
                  onMoveStep(
                    Number(move.dataset.moveStep),
                    Number(move.dataset.dir),
                  );
                  return;
                }
                const hit = target.closest<HTMLElement>("[data-insert-at]");
                if (hit) onAddStep(Number(hit.dataset.insertAt));
              }}
            />
            {nodes}
          </div>
        </div>
      }
    </>
  );

  return (
    <section className="portal-overview">
      <div className="portal-overview__head">
        <span className="portal-builder__section-label">
          {t("portal.pipelines.overview.title")}
        </span>
        <div className="portal-overview__viewbar">
          <Button
            variant="secondary"
            size="sm"
            className="portal-overview__codebtn"
            aria-pressed={Boolean(codeShown)}
            onClick={() => onToggleCode?.()}
          >
            {t("portal.pipelines.overview.code")}
          </Button>
          <SegmentedControl<OverviewMode>
            size="xs"
            ariaLabel={t("portal.pipelines.overview.viewLabel")}
            value={mode}
            onChange={changeMode}
            options={[
              { value: "flow", label: t("portal.pipelines.overview.flow") },
              { value: "spec", label: t("portal.pipelines.overview.spec") },
            ]}
          />
        </div>
      </div>
      {mode === "spec" ? spec : flow}
    </section>
  );
}
