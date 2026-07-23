import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
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
  onToggleSection: (target: "sources" | "trigger" | "output") => void;
  onSelectStep: (index: number) => void;
  onAddStep: (atIndex?: number) => void;
  onMoveStep: (index: number, delta: number) => void;
  onRemoveStep: (index: number) => void;
  /** Fired when the user flips Spec/Flow, so the page can match its copy. */
  onModeChange?: (mode: OverviewMode) => void;
}

export type OverviewMode = "spec" | "flow";

const MODE_KEY = "stirling.portal.pipelineViewMode";
const LOCK_KEY = "stirling.portal.pipelineFlowLock";

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

/** Vertical-spine default layout for the free canvas, centred on `spine`. */
function defaultFlowLayout(
  sourceIds: string[],
  stepCount: number,
  spine = 240,
): Record<string, NodePos> {
  const pos: Record<string, NodePos> = {};
  pos.trig = { x: spine + 14, y: 16 };
  const n = sourceIds.length;
  sourceIds.forEach((id, i) => {
    pos[`src:${id}`] = {
      x: Math.max(12, spine + (i - (n - 1) / 2) * 190),
      y: 92,
    };
  });
  pos.srcghost = { x: spine, y: 92 };
  for (let i = 0; i < stepCount; i++) {
    pos[`step:${i}`] = { x: spine, y: 208 + i * 112 };
  }
  pos.out = { x: spine, y: 208 + stepCount * 112 };
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
  const [posOverrides, setPosOverrides] = useState<Record<string, NodePos>>({});

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

  // Steps changed shape (add/remove/reorder): let the chain re-derive its
  // positions while keeping wherever the user parked sources and the trigger.
  const stepsSignature = stepLabels.join("|");
  useEffect(() => {
    setPosOverrides((prev) => {
      const next: Record<string, NodePos> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (!/^step:/.test(key) && key !== "ghost" && key !== "out") {
          next[key] = value;
        }
      }
      return next;
    });
  }, [stepsSignature]);

  // Centre the default spine in the visible canvas (node width 13.5rem = 216px).
  const [stageW, setStageW] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, locked]);
  const spineLeft =
    stageW > 0 ? Math.max(12, Math.round(stageW / 2) - 108) : 240;

  const defaults = defaultFlowLayout(
    sources.map((s) => s.id),
    stepLabels.length,
    spineLeft,
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
  const stageH = Math.max(280, maxY + 120);
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
    const firstStep = stepLabels.length ? "step:0" : null;
    srcIds.forEach((src, i) => {
      edges.push({ a: "trig", b: src, ghost: true });
      edges.push({
        a: src,
        b: firstStep ?? "out",
        ghost: src === "srcghost",
        // Only the first source wire carries the insert point, to avoid twins.
        insertAt: i === 0 ? 0 : undefined,
      });
    });
    for (let i = 0; i < stepLabels.length - 1; i++) {
      edges.push({ a: `step:${i}`, b: `step:${i + 1}`, insertAt: i + 1 });
    }
    if (stepLabels.length) {
      edges.push({
        a: `step:${stepLabels.length - 1}`,
        b: "out",
        insertAt: stepLabels.length,
      });
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
          ` style="left:${mx - 10}px;top:${my - 10}px">+</button>`;
      }
    }
    svg.innerHTML = html;
    if (insertsRef.current) insertsRef.current.innerHTML = inserts;
  }

  useLayoutEffect(() => {
    if (mode === "flow" && !locked) drawEdges();
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
          <span className="portal-overview__n">{num}</span>
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

  function stepActions(index: number) {
    return (
      <>
        <ActionIcon
          variant="tertiary"
          aria-label={t("portal.pipelines.composer.moveUp")}
          disabled={index === 0}
          onClick={() => onMoveStep(index, -1)}
        >
          <KeyboardArrowUpRoundedIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
        <ActionIcon
          variant="tertiary"
          aria-label={t("portal.pipelines.composer.moveDown")}
          disabled={index === stepLabels.length - 1}
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
    },
  ) {
    const free = !locked && opts?.nodeId;
    const pos = free ? nodePos(opts.nodeId!) : null;
    return (
      <Button
        variant="quiet"
        className={
          `portal-overview__node ${cls}` +
          (opts?.blank ? " portal-overview__node--blank" : "") +
          (opts?.active ? " portal-overview__node--active" : "")
        }
        onClick={guardedClick(onClick)}
        {...(free
          ? {
              "data-node": opts.nodeId,
              style: { left: pos!.x, top: pos!.y },
              onPointerDown: (e: React.PointerEvent<HTMLElement>) =>
                onNodePointerDown(opts.nodeId!, e),
              onPointerMove: onNodePointerMove,
              onPointerUp: onNodePointerUp,
            }
          : {})}
      >
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
      </Button>
    );
  }

  const connector = <span className="portal-overview__connector" aria-hidden />;

  function insertConnector(at: number) {
    return (
      <span className="portal-overview__connector portal-overview__connector--insert">
        <ActionIcon
          variant="secondary"
          className="portal-overview__insert"
          aria-label={t("portal.pipelines.composer.addTool")}
          onClick={() => onAddStep(at)}
        >
          +
        </ActionIcon>
      </span>
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
      {locked && connector}
      {locked ? (
        <div className="portal-overview__srcrow">
          {sources.length > 0
            ? sources.map((source) => (
                <span key={source.id}>
                  {flowNode(
                    source.name,
                    () => onToggleSection("sources"),
                    "portal-overview__node--source",
                    {
                      active: expanded === "sources",
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
                { blank: true, active: expanded === "sources" },
              )}
        </div>
      ) : sources.length > 0 ? (
        sources.map((source) => (
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
      ) : (
        flowNode(
          `+ ${t("portal.pipelines.overview.chooseInputCta")}`,
          () => onToggleSection("sources"),
          "portal-overview__node--source",
          { blank: true, active: expanded === "sources", nodeId: "srcghost" },
        )
      )}
      {locked && insertConnector(0)}
      {stepLabels.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className={locked ? "portal-overview__flowrow" : undefined}
        >
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
            },
          )}
          {locked && insertConnector(i + 1)}
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
        {!locked && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPosOverrides({})}
          >
            {t("portal.pipelines.overview.autoArrange")}
          </Button>
        )}
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
      {locked ? (
        <div className="portal-overview__flow">{nodes}</div>
      ) : (
        <div className="portal-overview__canvaswrap">
          <div
            ref={stageRef}
            className="portal-overview__stage"
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
                const hit = (e.target as HTMLElement).closest<HTMLElement>(
                  "[data-insert-at]",
                );
                if (hit) onAddStep(Number(hit.dataset.insertAt));
              }}
            />
            {nodes}
          </div>
        </div>
      )}
    </>
  );

  return (
    <section className="portal-overview">
      <div className="portal-overview__head">
        <span className="portal-builder__section-label">
          {t("portal.pipelines.overview.title")}
        </span>
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
      {mode === "spec" ? spec : flow}
    </section>
  );
}
