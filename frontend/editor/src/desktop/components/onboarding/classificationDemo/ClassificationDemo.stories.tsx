import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OnboardingSlideShell, {
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  ClassificationDemoBreakdown,
  ClassificationDemoChart,
  useSliceColours,
} from "@app/components/onboarding/classificationDemo/ClassificationDemoChart";
import {
  CategoryTicker,
  DefaultAppHero,
  FolderHero,
  FollowUpPanel,
  PrivacyNote,
  ProcessingHero,
  useProcessingLabel,
} from "@app/components/onboarding/classificationDemo/classificationDemoSlides";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  mergeOutcomes,
  type ClassificationDemoGroupCount,
  type ClassificationDemoOutcome,
  type ClassificationDemoPhase,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";
import styles from "@app/components/onboarding/classificationDemo/classificationDemo.module.css";

interface WalkthroughArgs {
  /** PDFs "in the folder": what is left after the first 50 sizes the follow-up offer. */
  pdfsInFolder: number;
  /** Simulated time per document; the live sweep is bound by disk and the heuristic. */
  msPerFile: number;
}

/**
 * The desktop onboarding demo on fixed data, so every state is reachable without a
 * Downloads folder, a Tauri host or a real sweep. Same components the live flow renders;
 * only the data source differs. `Walkthrough` runs the whole flow end to end.
 */
const meta = {
  title: "Onboarding/Classification Demo",
  parameters: { layout: "fullscreen" },
  args: { pdfsInFolder: 73, msPerFile: 90 },
  argTypes: {
    pdfsInFolder: { control: { type: "number", min: 0, max: 2000 } },
    msPerFile: { control: { type: "number", min: 0, max: 1000 } },
  },
} satisfies Meta<WalkthroughArgs>;
export default meta;

type Story = StoryObj<WalkthroughArgs>;

/**
 * The whole flow, end to end, on a simulated folder. Both buttons on the first slide
 * lead on (the real one asks the OS in between); "Process the rest" runs a second batch
 * and folds it into the chart. Use the controls to change the folder size and pace.
 */
export const Walkthrough: Story = {
  render: (args) => (
    <WalkthroughDemo key={`${args.pdfsInFolder}-${args.msPerFile}`} {...args} />
  ),
};

/** Shaped like a real sweep: a few big families over a long tail of singles. Sums to
 *  one batch of {@link CLASSIFICATION_DEMO_BATCH_SIZE}. */
const GROUPS: ClassificationDemoGroupCount[] = [
  {
    id: "finance",
    name: "Financial",
    count: 18,
    labels: [
      { id: "invoice", name: "Invoice", count: 10 },
      { id: "receipt", name: "Receipt", count: 5 },
      { id: "statement", name: "Bank statement", count: 3 },
    ],
  },
  {
    id: "legal",
    name: "Legal",
    count: 11,
    labels: [
      { id: "contract", name: "Contract", count: 6 },
      { id: "nda", name: "NDA", count: 3 },
      { id: "will", name: "Will", count: 2 },
    ],
  },
  {
    id: "correspondence",
    name: "Correspondence",
    count: 9,
    labels: [{ id: "letter", name: "Letter", count: 9 }],
  },
  {
    id: "hr",
    name: "HR",
    count: 5,
    labels: [
      { id: "employment-contract", name: "Employment contract", count: 5 },
    ],
  },
  {
    id: "medical",
    name: "Medical",
    count: 3,
    labels: [{ id: "medical-report", name: "Medical report", count: 3 }],
  },
  { id: "other", name: "Other", count: 4, labels: [] },
];

/** One simulated document's verdict, as a one-document outcome so the running tally can
 *  fold it in with the same {@link mergeOutcomes} the live follow-up uses. */
function verdictOutcome(
  group: ClassificationDemoGroupCount,
  label: { id: string; name: string } | null,
): ClassificationDemoOutcome {
  return {
    processed: 1,
    groups: [
      {
        id: group.id,
        name: group.name,
        count: 1,
        labels: label ? [{ ...label, count: 1 }] : [],
      },
    ],
    pdfsInFolder: 0,
    remaining: 0,
    sweptPaths: [],
  };
}

/** GROUPS expanded to one verdict per document, round-robin across types so the ticker
 *  fills in the way a real folder does rather than one category at a time. */
const VERDICTS: ClassificationDemoOutcome[] = (() => {
  const queues = GROUPS.flatMap((group) =>
    group.labels.length === 0
      ? [Array.from({ length: group.count }, () => verdictOutcome(group, null))]
      : group.labels.map((label) =>
          Array.from({ length: label.count }, () =>
            verdictOutcome(group, label),
          ),
        ),
  );
  const out: ClassificationDemoOutcome[] = [];
  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) out.push(next);
    }
  }
  return out;
})();

const EMPTY_OUTCOME: ClassificationDemoOutcome = {
  processed: 0,
  groups: [],
  pdfsInFolder: 0,
  remaining: 0,
  sweptPaths: [],
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function Card({
  title,
  body,
  buttons,
  hero,
}: {
  title?: ReactNode;
  body: ReactNode;
  buttons: ShellButton[];
  hero?: ReactNode;
}) {
  return (
    <OnboardingSlideShell
      opened
      hero={hero}
      slideKey="story"
      title={title}
      body={body}
      stepIndex={0}
      stepCount={2}
      buttons={buttons}
      onAction={() => {}}
      onClose={() => {}}
    />
  );
}

/** Step one: the offer to become the default PDF app. */
export const DefaultAppSlide: Story = {
  render: () => (
    <Card
      hero={<DefaultAppHero />}
      title="Open every PDF in Stirling"
      body="Make Stirling your default PDF app. Every PDF you open, from email, your browser, or your desktop, lands here, ready to read or edit. You can change this any time in Settings."
      buttons={[
        { key: "skip", label: "Not now", action: "skip" },
        {
          key: "set",
          label: "Make Stirling my default",
          primary: true,
          action: "set",
        },
      ]}
    />
  ),
};

/** Step two: the offer to sweep the Downloads folder. */
export const FolderOffer: Story = {
  render: () => (
    <Card
      hero={<FolderHero />}
      title="See what Stirling can do with a whole folder"
      body={
        <div>
          <p>
            Classify and organise the 50 most recent PDFs in your Downloads
            folder by type.
          </p>
          <PrivacyNote />
        </div>
      }
      buttons={[
        { key: "skip", label: "Skip", action: "skip" },
        {
          key: "start",
          label: "Process my Downloads folder",
          primary: true,
          action: "start",
        },
      ]}
    />
  ),
};

/** Mid-sweep, with the shimmer and mark animation running on a loop. */
export const Processing: Story = {
  render: () => (
    <div className={styles.view}>
      <div className={styles.viewColumn}>
        <ProcessingHero label="Processing file 18/50..." />
        <p className={styles.counts}>
          <span className={styles.countsNumber}>17</span>of 50 PDFs processed
        </p>
        <CategoryTicker groups={GROUPS.slice(0, 4)} />
        <div className={styles.viewActions}>
          <Button variant="quiet" accent="neutral">
            Stop
          </Button>
        </div>
      </div>
    </div>
  ),
};

/** Every phrase the status line moves through, side by side. */
export const ProcessingPhases: Story = {
  render: () => (
    <div className={styles.view}>
      <div className={styles.viewColumn}>
        <ProcessingHero label="Reading Downloads folder..." />
        <ProcessingHero label="Gathering PDF files..." />
        <ProcessingHero label="Processing file 31/50..." />
        <ProcessingHero label="Finishing up..." />
      </div>
    </div>
  ),
};

function CloseCorner({ onClick }: { onClick?: () => void }) {
  return (
    <ActionIcon
      className={styles.viewClose}
      variant="tertiary"
      accent="neutral"
      onClick={onClick}
      aria-label="Close"
    >
      <CloseRoundedIcon fontSize="small" />
    </ActionIcon>
  );
}

function ResultsView({
  groups,
  remaining,
  onLeave,
  onContinue,
}: {
  groups: ClassificationDemoGroupCount[];
  remaining: number;
  onLeave?: () => void;
  onContinue?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const colours = useSliceColours(groups);
  const selected = groups.find((group) => group.id === selectedId) ?? null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const canContinue = remaining > 0;

  return (
    <div className={styles.view}>
      <CloseCorner onClick={onLeave} />
      <div className={styles.results}>
        <header className={styles.resultsHeader}>
          <BrandMark height="2.25rem" />
          <h2 className={styles.viewHeading}>Your Downloads, sorted</h2>
          <p className={styles.viewLead}>
            Stirling read {total} PDFs and sorted them into {groups.length}{" "}
            types.
          </p>
        </header>

        <div className={styles.resultsBody}>
          <ClassificationDemoChart
            groups={groups}
            total={total}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div className={styles.resultsDetail}>
            <CategoryTicker
              groups={groups}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <ClassificationDemoBreakdown
              group={selected}
              colour={selected ? colours.get(selected.id) : undefined}
            />
          </div>
        </div>

        <footer className={styles.resultsFooter}>
          {canContinue && <FollowUpPanel remaining={remaining} />}
          <div className={styles.viewActions}>
            <Button variant="quiet" accent="neutral" onClick={onLeave}>
              {canContinue ? "Not now" : "Done"}
            </Button>
            {canContinue && (
              <Button onClick={onContinue}>Process the rest</Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The finished sweep. Select a slice or a chip to lift it and open its breakdown. */
export const Results: Story = {
  render: () => <ResultsView groups={GROUPS} remaining={18} />,
};

/** A large folder still offers all remaining documents, with credits managed by the server. */
export const ResultsLargeFolder: Story = {
  render: () => <ResultsView groups={GROUPS} remaining={612} />,
};

/** The folder is fully swept: no follow-up, just Done. */
export const ResultsNothingLeft: Story = {
  render: () => <ResultsView groups={GROUPS} remaining={0} />,
};

/** A single family draws as a full circle rather than a wedge. */
export const SingleCategory: Story = {
  render: () => <ResultsView groups={[GROUPS[0]]} remaining={0} />,
};

/** Every type a single document: bars scale against a floor so they are not all full-width. */
export const AllSingletons: Story = {
  render: () => (
    <ResultsView
      groups={[
        {
          id: "legal",
          name: "Legal",
          count: 5,
          labels: [
            { id: "will", name: "Will", count: 1 },
            { id: "legal-notice", name: "Legal notice", count: 1 },
            { id: "contract", name: "Contract", count: 1 },
            { id: "lease", name: "Lease agreement", count: 1 },
            {
              id: "employment-contract",
              name: "Employment contract",
              count: 1,
            },
          ],
        },
      ]}
      remaining={0}
    />
  ),
};

/** Nothing matched the vocabulary: one grey slice with no types to drill into. */
export const NothingClassified: Story = {
  render: () => (
    <ResultsView
      groups={[{ id: "other", name: "Other", count: 12, labels: [] }]}
      remaining={0}
    />
  ),
};

type Stage = "default" | "folder" | "processing" | "results" | "closed";

/** The live flow on a simulated folder: same slides, same view, same merge of a
 *  follow-up batch into the pile, with a timer standing in for disk and heuristic. */
function WalkthroughDemo({ pdfsInFolder, msPerFile }: WalkthroughArgs) {
  const [stage, setStage] = useState<Stage>("default");
  const [phase, setPhase] = useState<ClassificationDemoPhase>("reading");
  const [batchTotal, setBatchTotal] = useState(0);
  const [batch, setBatch] = useState<ClassificationDemoOutcome>(EMPTY_OUTCOME);
  const [outcome, setOutcome] = useState<ClassificationDemoOutcome | null>(
    null,
  );
  const [swept, setSwept] = useState(0);
  const cancelled = useRef(false);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const processingLabel = useProcessingLabel(
    phase,
    batch.processed,
    batchTotal,
  );

  const run = async (limit: number) => {
    cancelled.current = false;
    const total = Math.min(limit, pdfsInFolder - swept);
    setStage("processing");
    setPhase("reading");
    setBatch(EMPTY_OUTCOME);
    setBatchTotal(0);
    await sleep(700);
    if (cancelled.current) return;
    setPhase("gathering");
    await sleep(700);
    if (cancelled.current) return;
    setPhase("processing");
    setBatchTotal(total);
    let tally = EMPTY_OUTCOME;
    for (let i = 0; i < total; i += 1) {
      await sleep(msPerFile);
      if (cancelled.current) return;
      tally = mergeOutcomes(tally, VERDICTS[(swept + i) % VERDICTS.length]);
      setBatch(tally);
    }
    setPhase("finished");
    await sleep(400);
    if (cancelled.current) return;
    setSwept(swept + total);
    setOutcome((previous) =>
      previous ? mergeOutcomes(previous, tally) : tally,
    );
    setStage("results");
  };

  const close = () => {
    cancelled.current = true;
    setStage("closed");
  };

  const restart = () => {
    cancelled.current = true;
    setStage("default");
    setOutcome(null);
    setBatch(EMPTY_OUTCOME);
    setSwept(0);
  };

  if (stage === "default") {
    return (
      <OnboardingSlideShell
        opened
        hero={<DefaultAppHero />}
        slideKey="default-app"
        title="Open every PDF in Stirling"
        body="Make Stirling your default PDF app. Every PDF you open, from email, your browser, or your desktop, lands here, ready to read or edit. You can change this any time in Settings."
        stepIndex={0}
        stepCount={2}
        buttons={[
          { key: "skip", label: "Not now", action: "next" },
          {
            key: "set",
            label: "Make Stirling my default",
            primary: true,
            action: "next",
          },
        ]}
        onAction={() => setStage("folder")}
        onClose={close}
      />
    );
  }

  if (stage === "folder") {
    return (
      <OnboardingSlideShell
        opened
        hero={<FolderHero />}
        slideKey="folder"
        title="See what Stirling can do with a whole folder"
        body={
          <div>
            <p>
              Classify and organise the {CLASSIFICATION_DEMO_BATCH_SIZE} most
              recent PDFs in your Downloads folder by type.
            </p>
            <PrivacyNote />
          </div>
        }
        stepIndex={1}
        stepCount={2}
        buttons={[
          { key: "skip", label: "Skip", action: "skip" },
          {
            key: "start",
            label: "Process my Downloads folder",
            primary: true,
            action: "start",
          },
        ]}
        onAction={(action) =>
          action === "start"
            ? void run(CLASSIFICATION_DEMO_BATCH_SIZE)
            : close()
        }
        onClose={close}
      />
    );
  }

  if (stage === "processing") {
    return (
      <div className={styles.view}>
        <CloseCorner onClick={close} />
        <div className={styles.viewColumn}>
          <ProcessingHero label={processingLabel} />
          <p className={styles.counts}>
            <span className={styles.countsNumber}>{batch.processed}</span>
            of {batchTotal} PDFs processed
          </p>
          <CategoryTicker groups={batch.groups} />
          <div className={styles.viewActions}>
            <Button variant="quiet" accent="neutral" onClick={close}>
              Stop
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "results" && outcome) {
    const remaining = pdfsInFolder - swept;
    return (
      <ResultsView
        groups={outcome.groups}
        remaining={remaining}
        onLeave={close}
        onContinue={() => void run(remaining)}
      />
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.viewColumn}>
        <BrandMark height="2.25rem" />
        <h2 className={styles.viewHeading}>Onboarding closed</h2>
        <p className={styles.viewLead}>
          In the app the workbench takes the canvas back here.
        </p>
        <div className={styles.viewActions}>
          <Button onClick={restart}>Start again</Button>
        </div>
      </div>
    </div>
  );
}
