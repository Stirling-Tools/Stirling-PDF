// Stale PR triage, run daily by .github/workflows/stale-prs.yml.

const DAY_MS = 24 * 60 * 60 * 1000;

export const LABELS = {
  stale: "Stale PR",
  onHold: "on-hold",
  backlogCleanup: "backlog-cleanup",
  waitingOnAuthor: "waiting-on-author",
  conflicts: "has conflicts", // must match CONFLICT_LABEL in pr-conflict-labeler.yml
};

export type Reason = "conflicts" | "waitingOnAuthor" | "idleDraft";

const TURN_LABELS: { label: string; reason: Reason }[] = [
  { label: LABELS.conflicts, reason: "conflicts" },
  { label: LABELS.waitingOnAuthor, reason: "waitingOnAuthor" },
];

export const TURN_DAYS = 7;
export const IDLE_DRAFT_DAYS = 30;
export const CLOSE_AFTER_WARNING_DAYS = 7;

// GitHub asks for at least a second between writes to stay under its secondary rate limit.
const WRITE_INTERVAL_MS = 1000;

// The same wait pr-conflict-labeler.yml gives GitHub to compute mergeability.
const MERGEABILITY_ATTEMPTS = 6;
const MERGEABILITY_RETRY_MS = 5000;

// A warning bumps updatedAt twice, comment then label; a draft updated within this of
// its Stale PR label has not been touched since.
const OWN_WRITE_SLACK_MS = 60 * 1000;

// Numbers only: within a page of PRs GitHub silently truncates nested connections,
// dropping the newest events while reporting them complete, so each PR is read alone.
const OPEN_PULL_NUMBERS_QUERY = `
  query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { number }
      }
    }
  }
`;

const PULL_REQUEST_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        state
        url
        isDraft
        updatedAt
        baseRefName
        author { login __typename }
        labels(first: 100) { nodes { name } }
        timelineItems(
          last: 100
          before: $before
          itemTypes: [LABELED_EVENT, UNLABELED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]
        ) {
          pageInfo { hasPreviousPage startCursor }
          nodes {
            __typename
            ... on LabeledEvent { createdAt label { name } }
            ... on UnlabeledEvent { createdAt label { name } }
            ... on ReopenedEvent { createdAt }
            ... on ReadyForReviewEvent { createdAt }
            ... on ConvertToDraftEvent { createdAt }
          }
        }
      }
    }
  }
`;

export type TimelineEvent =
  | { __typename: "LabeledEvent" | "UnlabeledEvent"; createdAt: string; label: { name: string } }
  | { __typename: "ReopenedEvent" | "ReadyForReviewEvent" | "ConvertToDraftEvent"; createdAt: string };

interface Author {
  login: string;
  __typename: string;
}

/** One PR as PULL_REQUEST_QUERY returns it: must stay in sync with the query. */
export interface PullRequestNode {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  isDraft: boolean;
  updatedAt: string;
  baseRefName: string;
  author: Author | null;
  labels: { nodes: { name: string }[] };
  timelineItems: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: TimelineEvent[];
  };
}

/** An open PR with its complete label, reopen and draft history. */
export interface PullRequest {
  number: number;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  baseRefName: string;
  author: Author | null;
  labels: string[];
  timeline: TimelineEvent[];
}

export type Action = "none" | "warn" | "pending" | "close" | "clear";

export interface Decision {
  action: Action;
  reasons: Reason[];
}

export interface Repo {
  owner: string;
  repo: string;
}

export type IssueRef = Repo & { issue_number: number };

/** The parts of github-script's `github` client these scripts call. */
export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  rest: {
    issues: {
      createComment(params: IssueRef & { body: string }): Promise<unknown>;
      addLabels(params: IssueRef & { labels: string[] }): Promise<unknown>;
      removeLabel(params: IssueRef & { name: string }): Promise<unknown>;
    };
    pulls: {
      get(params: Repo & { pull_number: number }): Promise<{ data: { mergeable: boolean | null } }>;
      update(params: Repo & { pull_number: number; state: "closed" }): Promise<unknown>;
    };
  };
}

type SummaryCell = string | { data: string; header?: boolean };

interface Summary {
  addHeading(text: string): Summary;
  addRaw(text: string, addEOL?: boolean): Summary;
  addTable(rows: SummaryCell[][]): Summary;
  write(): Promise<Summary>;
}

/** The parts of github-script's `core` (@actions/core) these scripts call. */
export interface Core {
  info(message: string): void;
  error(message: string): void;
  setFailed(message: string): void;
  summary: Summary;
}

const time = (iso: string) => Date.parse(iso);
const days = (ms: number) => Math.floor(ms / DAY_MS);
const latest = (times: number[]) => (times.length === 0 ? null : Math.max(...times));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasLabel = (pr: PullRequest, name: string) => pr.labels.includes(name);

function latestEvent(pr: PullRequest, matches: (event: TimelineEvent) => boolean) {
  return latest(pr.timeline.filter(matches).map((event) => time(event.createdAt)));
}

const labelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "LabeledEvent" && event.label.name === name;

const unlabelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "UnlabeledEvent" && event.label.name === name;

// What ends a warning on a ready PR: a turn label removed, a reopen, or a switch to draft and back.
const endsWarning = (event: TimelineEvent) =>
  event.__typename === "ReopenedEvent" ||
  event.__typename === "ReadyForReviewEvent" ||
  event.__typename === "ConvertToDraftEvent" ||
  TURN_LABELS.some(({ label }) => unlabelled(label)(event));

const NONE: Decision = { action: "none", reasons: [] };
const CLEAR: Decision = { action: "clear", reasons: [] };

function decideReady(pr: PullRequest, now: number, warnedAt: number | null): Decision {
  const turns = TURN_LABELS.filter(({ label }) => hasLabel(pr, label)).map(({ label, reason }) => ({
    reason,
    since: latestEvent(pr, labelled(label)) ?? now,
  }));

  if (warnedAt === null) {
    // Removing Stale PR, by hand or by a clear, gives a full period before the next warning.
    const restartedAt = latestEvent(pr, unlabelled(LABELS.stale)) ?? 0;
    const due = turns.filter((turn) => now - Math.max(turn.since, restartedAt) >= TURN_DAYS * DAY_MS);
    return due.length > 0 ? { action: "warn", reasons: due.map((turn) => turn.reason) } : NONE;
  }

  const warned = turns.filter((turn) => turn.since <= warnedAt);
  const endedAt = latestEvent(pr, endsWarning);
  if (warned.length === 0 || (endedAt !== null && endedAt > warnedAt)) return CLEAR;
  const reasons = warned.map((turn) => turn.reason);
  return { action: now - warnedAt >= CLOSE_AFTER_WARNING_DAYS * DAY_MS ? "close" : "pending", reasons };
}

function decideDraft(pr: PullRequest, now: number, warnedAt: number | null): Decision {
  const updatedAt = time(pr.updatedAt);
  if (warnedAt === null) {
    return now - updatedAt >= IDLE_DRAFT_DAYS * DAY_MS ? { action: "warn", reasons: ["idleDraft"] } : NONE;
  }
  if (updatedAt > warnedAt + OWN_WRITE_SLACK_MS) return CLEAR;
  return { action: now - warnedAt >= CLOSE_AFTER_WARNING_DAYS * DAY_MS ? "close" : "pending", reasons: ["idleDraft"] };
}

/**
 * What to do with one PR at epoch ms `now`. `action` is one of:
 * - "none": nothing has been outstanding long enough to warn.
 * - "warn": post the warning naming `reasons` and add the Stale PR label.
 * - "pending": warned, `reasons` still stand, and the close is not due yet.
 * - "close": warned CLOSE_AFTER_WARNING_DAYS ago and `reasons` still stand.
 * - "clear": warned, but something has changed since; remove the label.
 *
 * Conflicts still need confirming with GitHub before acting; see confirmConflicts.
 */
export function decide(pr: PullRequest, now: number): Decision {
  const warnedAt = hasLabel(pr, LABELS.stale) ? (latestEvent(pr, labelled(LABELS.stale)) ?? now) : null;
  if (pr.author?.__typename === "Bot" || hasLabel(pr, LABELS.onHold)) return warnedAt === null ? NONE : CLEAR;
  return pr.isDraft ? decideDraft(pr, now, warnedAt) : decideReady(pr, now, warnedAt);
}

function problem(reason: Reason, pr: PullRequest, now: number): string {
  switch (reason) {
    case "conflicts":
      return `It has merge conflicts with \`${pr.baseRefName}\`.`;
    case "waitingOnAuthor":
      return "A maintainer is waiting on a response from you.";
    case "idleDraft":
      return `It has been a draft with no activity for ${days(now - time(pr.updatedAt))} days.`;
  }
}

function remedy(reason: Reason, pr: PullRequest): string {
  switch (reason) {
    case "conflicts":
      return `Merging or rebasing onto \`${pr.baseRefName}\` resolves them.`;
    case "waitingOnAuthor":
      return "A reply, a new push or re-requesting review keeps it open.";
    case "idleDraft":
      return "Any activity keeps it open, such as a push, a comment or marking it ready for review.";
  }
}

const authorLogin = (pr: PullRequest) => pr.author?.login ?? "ghost";

export function warningComment(pr: PullRequest, reasons: Reason[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR looks stale because it's waiting on you:`,
    "",
    ...reasons.map((reason) => `- ${problem(reason, pr, now)} ${remedy(reason, pr)}`),
    "",
    `If this is still outstanding in ${CLOSE_AFTER_WARNING_DAYS} days, the PR will be closed automatically.`,
    "If you think it's actually waiting on us rather than you, say so here and a maintainer will take a look.",
  ].join("\n");
}

export function closingComment(pr: PullRequest, reasons: Reason[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR has been closed automatically because it was still waiting on you ${CLOSE_AFTER_WARNING_DAYS} days after the reminder:`,
    "",
    ...reasons.map((reason) => `- ${problem(reason, pr, now)}`),
    "",
    "Thanks for the contribution! If you pick this up again, reopen it (or ask here and a maintainer will) and fix the above.",
  ].join("\n");
}

async function fetchOpenPullNumbers(github: GitHubClient, repo: Repo) {
  const numbers: number[] = [];
  let cursor: string | null = null;
  do {
    const page: {
      repository: {
        pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { number: number }[] };
      };
    } = await github.graphql(OPEN_PULL_NUMBERS_QUERY, { ...repo, cursor });
    const { nodes, pageInfo } = page.repository.pullRequests;
    numbers.push(...nodes.map((node) => node.number));
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);
  return numbers;
}

async function fetchNode(github: GitHubClient, repo: Repo, number: number, before: string | null) {
  const page = await github.graphql<{ repository: { pullRequest: PullRequestNode | null } }>(PULL_REQUEST_QUERY, {
    ...repo,
    number,
    before,
  });
  return page.repository.pullRequest;
}

/** The PR with its whole timeline; null once it is closed or merged. */
async function fetchPullRequest(github: GitHubClient, repo: Repo, number: number): Promise<PullRequest | null> {
  const node = await fetchNode(github, repo, number, null);
  if (node?.state !== "OPEN") return null;
  const timeline = [...node.timelineItems.nodes];
  let { pageInfo } = node.timelineItems;
  while (pageInfo.hasPreviousPage) {
    const older = await fetchNode(github, repo, number, pageInfo.startCursor);
    if (!older) break;
    timeline.unshift(...older.timelineItems.nodes);
    pageInfo = older.timelineItems.pageInfo;
  }
  return {
    number: node.number,
    url: node.url,
    isDraft: node.isDraft,
    updatedAt: node.updatedAt,
    baseRefName: node.baseRefName,
    author: node.author,
    labels: node.labels.nodes.map((label) => label.name),
    timeline,
  };
}

async function confirmedConflicting(github: GitHubClient, repo: Repo, number: number, retryMs: number) {
  for (let attempt = 1; attempt <= MERGEABILITY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(retryMs);
    const { data } = await github.rest.pulls.get({ ...repo, pull_number: number });
    if (data.mergeable !== null) return !data.mergeable;
  }
  return false;
}

// The has conflicts label can be hours behind main, so a warning or close only names
// a conflict GitHub confirms now. Unknown counts as resolved.
async function confirmConflicts(
  github: GitHubClient,
  repo: Repo,
  pr: PullRequest,
  decision: Decision,
  retryMs: number,
): Promise<Decision> {
  const acts = decision.action === "warn" || decision.action === "close";
  if (!acts || !decision.reasons.includes("conflicts")) return decision;
  if (await confirmedConflicting(github, repo, pr.number, retryMs)) return decision;
  const reasons = decision.reasons.filter((reason) => reason !== "conflicts");
  if (reasons.length > 0) return { ...decision, reasons };
  return decision.action === "close" ? { action: "pending", reasons: decision.reasons } : NONE;
}

const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/** Removes a label, treating one that is already gone as removed. */
export async function removeLabel(github: GitHubClient, issue: IssueRef, name: string) {
  await github.rest.issues.removeLabel({ ...issue, name }).catch((error: unknown) => {
    if (!isNotFound(error)) throw error;
  });
}

async function paced(intervalMs: number, writes: (() => Promise<unknown>)[]) {
  for (const [index, write] of writes.entries()) {
    if (index > 0) await sleep(intervalMs);
    await write();
  }
}

// Comment before labelling, and before closing: if a later call fails, the next run
// repeats a comment rather than closing a PR whose author was never told.
async function apply(
  github: GitHubClient,
  issue: IssueRef,
  pr: PullRequest,
  decision: Decision,
  now: number,
  intervalMs: number,
) {
  const { issues, pulls } = github.rest;
  switch (decision.action) {
    case "warn":
      await paced(intervalMs, [
        () => issues.createComment({ ...issue, body: warningComment(pr, decision.reasons, now) }),
        () => issues.addLabels({ ...issue, labels: [LABELS.stale] }),
      ]);
      break;
    case "close":
      await paced(intervalMs, [
        () => issues.createComment({ ...issue, body: closingComment(pr, decision.reasons, now) }),
        () => issues.addLabels({ ...issue, labels: [LABELS.backlogCleanup] }),
        () => pulls.update({ owner: issue.owner, repo: issue.repo, pull_number: pr.number, state: "closed" }),
      ]);
      break;
    case "clear":
      await removeLabel(github, issue, LABELS.stale);
      break;
  }
}

const ACTION_ORDER: Action[] = ["close", "warn", "clear", "pending"];
const WRITES: Action[] = ["warn", "close", "clear"];

interface Result {
  pr: PullRequest;
  decision: Decision;
}

async function writeSummary(core: Core, results: Result[], live: boolean) {
  const rows = results
    .filter(({ decision }) => decision.action !== "none")
    .sort((a, b) => ACTION_ORDER.indexOf(a.decision.action) - ACTION_ORDER.indexOf(b.decision.action))
    .map(({ pr, decision }) => [
      `<a href="${pr.url}">#${pr.number}</a>`,
      authorLogin(pr),
      decision.action,
      decision.reasons.join(", "),
    ]);
  await core.summary
    .addHeading(live ? "Stale PR triage" : "Stale PR triage (dry run: no PRs changed)")
    .addRaw(`${results.length} open PRs, ${rows.length} with something outstanding.`, true)
    .addTable([
      [
        { data: "PR", header: true },
        { data: "Author", header: true },
        { data: "Action", header: true },
        { data: "Reasons", header: true },
      ],
      ...rows,
    ])
    .write();
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface TriageInputs {
  github: GitHubClient;
  context: { repo: Repo };
  core: Core;
  /** false reports what would happen without commenting, labelling or closing. */
  live: boolean;
  /** Least pause between writes. Defaults to WRITE_INTERVAL_MS. */
  writeIntervalMs?: number;
  /** Pause between mergeability checks. Defaults to MERGEABILITY_RETRY_MS. */
  mergeabilityRetryMs?: number;
}

/**
 * Triages every open PR and writes a job summary. A PR that cannot be read or updated
 * is logged and skipped, and the job is failed at the end. Throws if the open PRs
 * cannot be listed.
 */
export default async function triageStalePullRequests({
  github,
  context,
  core,
  live,
  writeIntervalMs = WRITE_INTERVAL_MS,
  mergeabilityRetryMs = MERGEABILITY_RETRY_MS,
}: TriageInputs) {
  const now = Date.now();
  const { repo } = context;
  const results: Result[] = [];
  let failures = 0;

  for (const number of await fetchOpenPullNumbers(github, repo)) {
    try {
      const pr = await fetchPullRequest(github, repo, number);
      if (pr === null) continue;
      const decision = await confirmConflicts(github, repo, pr, decide(pr, now), mergeabilityRetryMs);
      results.push({ pr, decision });
      if (decision.action === "none") continue;

      core.info(`#${number}: ${decision.action} (${decision.reasons.join(", ")})`);
      if (!live || !WRITES.includes(decision.action)) continue;
      await apply(github, { ...repo, issue_number: number }, pr, decision, now, writeIntervalMs);
      await sleep(writeIntervalMs);
    } catch (error) {
      failures += 1;
      core.error(`#${number}: ${errorMessage(error)}`);
    }
  }

  await writeSummary(core, results, live);
  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}
