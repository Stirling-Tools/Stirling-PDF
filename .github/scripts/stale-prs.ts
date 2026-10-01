// Stale PR triage, run daily by .github/workflows/stale-prs.yml.
//
// Warns a PR that has been waiting on its author for too long, and closes it if the
// same thing is still outstanding CLOSE_AFTER_WARNING_DAYS later. A PR waiting on
// maintainers is never warned or closed.

const DAY_MS = 24 * 60 * 60 * 1000;

export const LABELS = {
  stale: "Stale PR",
  onHold: "on-hold",
  needsChanges: "needs-changes",
  backlogCleanup: "backlog-cleanup",
  waitingOnAuthor: "waiting-on-author",
  waitingOnReview: "waiting-on-review",
  conflicts: "has conflicts", // must match CONFLICT_LABEL in pr-conflict-labeler.yml
};

export type TurnKind = "conflicts" | "review" | "needsChanges" | "idleDraft";

export const WARN_AFTER_DAYS: Record<TurnKind, number> = {
  conflicts: 7,
  review: 7,
  needsChanges: 7,
  idleDraft: 30,
};

export const CLOSE_AFTER_WARNING_DAYS = 7;

// GitHub's secondary rate limit expects a pause between writes, and the first run
// labels every open PR.
const WRITE_INTERVAL_MS = 1000;

const CORE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const REVIEW_VERDICTS = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

export const PULL_REQUESTS_QUERY = `
  query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          url
          isDraft
          mergeable
          baseRefName
          createdAt
          author { login __typename }
          labels(first: 50) { nodes { name } }
          commits(last: 1) { nodes { commit { committedDate } } }
          reviews(last: 50) { nodes { state submittedAt authorAssociation author { login __typename } } }
          comments(last: 50) { nodes { createdAt author { login } } }
          timelineItems(last: 100, itemTypes: [LABELED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
            nodes {
              __typename
              ... on LabeledEvent { createdAt label { name } }
              ... on ReopenedEvent { createdAt }
              ... on ReadyForReviewEvent { createdAt actor { login } }
              ... on ConvertToDraftEvent { createdAt actor { login } }
            }
          }
        }
      }
    }
  }
`;

interface Actor {
  login: string;
}

interface Author extends Actor {
  __typename: string;
}

export interface Review {
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submittedAt: string | null;
  authorAssociation: string;
  author: Author | null;
}

type SubmittedReview = Review & { submittedAt: string; author: Author };

export type TimelineEvent =
  | { __typename: "LabeledEvent"; createdAt: string; label: { name: string } }
  | { __typename: "ReopenedEvent"; createdAt: string }
  | { __typename: "ReadyForReviewEvent" | "ConvertToDraftEvent"; createdAt: string; actor: Actor | null };

/** One node of PULL_REQUESTS_QUERY: must stay in sync with the query. */
export interface PullRequest {
  number: number;
  url: string;
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  baseRefName: string;
  createdAt: string;
  author: Author | null;
  labels: { nodes: { name: string }[] };
  commits: { nodes: { commit: { committedDate: string } }[] };
  reviews: { nodes: Review[] };
  comments: { nodes: { createdAt: string; author: Actor | null }[] };
  timelineItems: { nodes: TimelineEvent[] };
}

interface PullRequestsPage {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: PullRequest[];
    };
  };
}

/** `since` is the epoch ms when this became the author's turn. */
export type Turn =
  | { kind: "conflicts" | "needsChanges" | "idleDraft"; since: number }
  | { kind: "review"; since: number; reviewer: string };

export type Action = "none" | "warn" | "pending" | "close" | "clear";

export interface Decision {
  action: Action;
  turns: Turn[];
}

export interface TurnLabelChange {
  label: string;
  add: boolean;
  remove: string[];
}

interface Repo {
  owner: string;
  repo: string;
}

type IssueRef = Repo & { issue_number: number };

/** The parts of github-script's `github` client this script calls. */
export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  rest: {
    issues: {
      createComment(params: IssueRef & { body: string }): Promise<unknown>;
      addLabels(params: IssueRef & { labels: string[] }): Promise<unknown>;
      removeLabel(params: IssueRef & { name: string }): Promise<unknown>;
    };
    pulls: {
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

/** The parts of github-script's `core` (@actions/core) this script calls. */
export interface Core {
  info(message: string): void;
  error(message: string): void;
  setFailed(message: string): void;
  summary: Summary;
}

const time = (iso: string) => Date.parse(iso);
const days = (ms: number) => Math.floor(ms / DAY_MS);
const latest = (times: number[]) => (times.length === 0 ? null : Math.max(...times));

function hasLabel(pr: PullRequest, name: string) {
  return pr.labels.nodes.some((label) => label.name === name);
}

function latestLabelTime(pr: PullRequest, name: string) {
  return latest(
    pr.timelineItems.nodes.flatMap((event) =>
      event.__typename === "LabeledEvent" && event.label.name === name ? [time(event.createdAt)] : [],
    ),
  );
}

function latestReopenTime(pr: PullRequest) {
  return latest(
    pr.timelineItems.nodes.flatMap((event) => (event.__typename === "ReopenedEvent" ? [time(event.createdAt)] : [])),
  );
}

// Deliberately not updatedAt: label changes, CI comments and this bot all bump it.
function lastAuthorActivity(pr: PullRequest) {
  const author = pr.author?.login;
  const isAuthor = (actor: Actor | null) => author !== undefined && actor?.login === author;
  return Math.max(
    time(pr.createdAt),
    ...pr.commits.nodes.map((node) => time(node.commit.committedDate)),
    ...pr.comments.nodes.filter((comment) => isAuthor(comment.author)).map((comment) => time(comment.createdAt)),
    ...pr.reviews.nodes.flatMap((review) =>
      review.submittedAt !== null && isAuthor(review.author) ? [time(review.submittedAt)] : [],
    ),
    ...pr.timelineItems.nodes.flatMap((event) =>
      (event.__typename === "ReadyForReviewEvent" || event.__typename === "ConvertToDraftEvent") &&
      isAuthor(event.actor)
        ? [time(event.createdAt)]
        : [],
    ),
  );
}

// The label's timestamp is when the conflict started. `mergeable` is often UNKNOWN
// while GitHub recomputes it, so it only overrides the label when the conflict is gone.
function conflictTurn(pr: PullRequest): Turn | null {
  if (pr.isDraft || pr.mergeable === "MERGEABLE" || !hasLabel(pr, LABELS.conflicts)) return null;
  const since = latestLabelTime(pr, LABELS.conflicts);
  return since === null ? null : { kind: "conflicts", since };
}

function isCoreReview(review: Review, prAuthor: string | undefined): review is SubmittedReview {
  return (
    review.submittedAt !== null &&
    review.author !== null &&
    review.author.__typename !== "Bot" &&
    review.author.login !== prAuthor &&
    CORE_ASSOCIATIONS.has(review.authorAssociation) &&
    REVIEW_VERDICTS.has(review.state)
  );
}

function reviewTurn(pr: PullRequest, authorActivity: number): Turn | null {
  if (pr.isDraft) return null;
  const review = pr.reviews.nodes
    .filter((candidate) => isCoreReview(candidate, pr.author?.login))
    .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))
    .at(-1);
  if (!review || review.state === "APPROVED") return null;
  const since = time(review.submittedAt);
  return since > authorActivity ? { kind: "review", since, reviewer: review.author.login } : null;
}

function needsChangesTurn(pr: PullRequest, authorActivity: number): Turn | null {
  if (!hasLabel(pr, LABELS.needsChanges)) return null;
  const since = latestLabelTime(pr, LABELS.needsChanges);
  return since !== null && since > authorActivity ? { kind: "needsChanges", since } : null;
}

function idleDraftTurn(pr: PullRequest, authorActivity: number): Turn | null {
  return pr.isDraft ? { kind: "idleDraft", since: authorActivity } : null;
}

/** Every reason the PR is currently waiting on its author; empty when it is waiting on maintainers. */
export function authorTurns(pr: PullRequest): Turn[] {
  const authorActivity = lastAuthorActivity(pr);
  return [
    conflictTurn(pr),
    reviewTurn(pr, authorActivity),
    needsChangesTurn(pr, authorActivity),
    idleDraftTurn(pr, authorActivity),
  ].filter((turn) => turn !== null);
}

/**
 * What to do with one PR at epoch ms `now`. `action` is one of:
 * - "none": nothing outstanding, or not outstanding long enough to warn.
 * - "warn": post the warning listing `turns` and add the Stale PR label.
 * - "pending": warned, and `turns` are still outstanding, but the close is not due yet.
 * - "close": warned CLOSE_AFTER_WARNING_DAYS ago and `turns` are still outstanding.
 * - "clear": warned, but resolved, reopened or exempted since; remove the label.
 */
export function decide(pr: PullRequest, now: number): Decision {
  const warned = hasLabel(pr, LABELS.stale);
  if (pr.author?.__typename === "Bot" || hasLabel(pr, LABELS.onHold)) {
    return { action: warned ? "clear" : "none", turns: [] };
  }

  const turns = authorTurns(pr);
  if (!warned) {
    const due = turns.some((turn) => now - turn.since >= WARN_AFTER_DAYS[turn.kind] * DAY_MS);
    return { action: due ? "warn" : "none", turns };
  }

  // A label older than the fetched timeline counts as just added: the close waits,
  // rather than firing on a warning whose date is unknown.
  const warnedAt = latestLabelTime(pr, LABELS.stale) ?? now;
  const reopenedAt = latestReopenTime(pr);
  // A turn that started after the warning means someone acted on it, so the
  // warning no longer describes it.
  const warnedTurns = turns.filter((turn) => turn.since <= warnedAt);
  if (warnedTurns.length === 0 || (reopenedAt !== null && reopenedAt > warnedAt)) {
    return { action: "clear", turns };
  }
  const closeDue = now - warnedAt >= CLOSE_AFTER_WARNING_DAYS * DAY_MS;
  return { action: closeDue ? "close" : "pending", turns: warnedTurns };
}

/**
 * Every open PR gets a turn label, bots and on-hold included: those are exempt from
 * closing, not from having a turn. Approved-but-unmerged counts as waiting on review.
 */
export function turnLabelChange(pr: PullRequest): TurnLabelChange {
  const label = authorTurns(pr).length > 0 ? LABELS.waitingOnAuthor : LABELS.waitingOnReview;
  return {
    label,
    add: !hasLabel(pr, label),
    remove: [LABELS.waitingOnAuthor, LABELS.waitingOnReview].filter((name) => name !== label && hasLabel(pr, name)),
  };
}

function problem(turn: Turn, pr: PullRequest, now: number): string {
  switch (turn.kind) {
    case "conflicts":
      return `It has merge conflicts with \`${pr.baseRefName}\`.`;
    case "review":
      return `The latest review, from ${turn.reviewer}, hasn't had a reply or a new push since.`;
    case "needsChanges":
      return "A maintainer has marked it as waiting on a response from you.";
    case "idleDraft":
      return `It has been a draft with no activity for ${days(now - turn.since)} days.`;
  }
}

function remedy(turn: Turn, pr: PullRequest): string {
  switch (turn.kind) {
    case "conflicts":
      return `Merging or rebasing onto \`${pr.baseRefName}\` resolves them.`;
    case "review":
    case "needsChanges":
      return "A reply or a new push keeps it open.";
    case "idleDraft":
      return "A push, a reply or marking it ready for review keeps it open.";
  }
}

const authorLogin = (pr: PullRequest) => pr.author?.login ?? "ghost";

export function warningComment(pr: PullRequest, turns: Turn[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR looks stale because it's waiting on you:`,
    "",
    ...turns.map((turn) => `- ${problem(turn, pr, now)} ${remedy(turn, pr)}`),
    "",
    `If this is still outstanding in ${CLOSE_AFTER_WARNING_DAYS} days, the PR will be closed automatically.`,
    "If you think it's actually waiting on us rather than you, say so here and a maintainer will take a look.",
  ].join("\n");
}

export function closingComment(pr: PullRequest, turns: Turn[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR has been closed automatically because it was still waiting on you ${CLOSE_AFTER_WARNING_DAYS} days after the reminder:`,
    "",
    ...turns.map((turn) => `- ${problem(turn, pr, now)}`),
    "",
    "Thanks for the contribution! If you pick this up again, please fix the above and open a new PR.",
  ].join("\n");
}

async function fetchOpenPullRequests(github: GitHubClient, { owner, repo }: Repo) {
  const pullRequests: PullRequest[] = [];
  let cursor: string | null = null;
  do {
    const page: PullRequestsPage = await github.graphql(PULL_REQUESTS_QUERY, { owner, repo, cursor });
    const { nodes, pageInfo } = page.repository.pullRequests;
    pullRequests.push(...nodes);
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);
  return pullRequests;
}

// Comment before labelling, and before closing: if the second call fails, the next
// run repeats a comment rather than closing a PR whose author was never told.
async function apply(github: GitHubClient, repo: Repo, pr: PullRequest, { action, turns }: Decision, now: number) {
  const issue = { ...repo, issue_number: pr.number };
  switch (action) {
    case "warn":
      await github.rest.issues.createComment({ ...issue, body: warningComment(pr, turns, now) });
      await github.rest.issues.addLabels({ ...issue, labels: [LABELS.stale] });
      break;
    case "close":
      await github.rest.issues.createComment({ ...issue, body: closingComment(pr, turns, now) });
      await github.rest.issues.addLabels({ ...issue, labels: [LABELS.backlogCleanup] });
      await github.rest.pulls.update({ ...repo, pull_number: pr.number, state: "closed" });
      break;
    case "clear":
      await github.rest.issues.removeLabel({ ...issue, name: LABELS.stale });
      break;
  }
}

async function applyTurnLabel(github: GitHubClient, repo: Repo, pr: PullRequest, change: TurnLabelChange) {
  const issue = { ...repo, issue_number: pr.number };
  if (change.add) await github.rest.issues.addLabels({ ...issue, labels: [change.label] });
  for (const name of change.remove) await github.rest.issues.removeLabel({ ...issue, name });
}

const ACTION_ORDER: Action[] = ["close", "warn", "clear", "pending"];

const SUMMARY_KIND_NAMES: Record<TurnKind, string> = {
  conflicts: "with conflicts",
  review: "with an unanswered review",
  needsChanges: "marked needs-changes",
  idleDraft: "drafts",
};

interface Result {
  pr: PullRequest;
  decision: Decision;
  turnLabel: TurnLabelChange;
}

// A PR being closed keeps whatever turn label it had: relabelling it is noise.
const needsRelabel = ({ decision, turnLabel }: Result) =>
  decision.action !== "close" && (turnLabel.add || turnLabel.remove.length > 0);

const hasWrites = (result: Result) =>
  needsRelabel(result) || ["warn", "close", "clear"].includes(result.decision.action);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeSummary(core: Core, results: Result[], live: boolean, now: number) {
  const rows = results
    .filter(({ decision }) => decision.action !== "none")
    .sort((a, b) => ACTION_ORDER.indexOf(a.decision.action) - ACTION_ORDER.indexOf(b.decision.action))
    .map(({ pr, decision }) => [
      `<a href="${pr.url}">#${pr.number}</a>`,
      authorLogin(pr),
      decision.action,
      decision.turns.map((turn) => `${turn.kind} ${days(now - turn.since)}d`).join(", "),
    ]);
  const turns = results.map(({ pr }) => authorTurns(pr));
  const onAuthor = turns.filter((prTurns) => prTurns.length > 0).length;
  const byKind = Object.entries(SUMMARY_KIND_NAMES).map(([kind, name]) => {
    const count = turns.filter((prTurns) => prTurns.some((turn) => turn.kind === kind)).length;
    return `${count} ${name}`;
  });
  const relabelled = results.filter(needsRelabel).length;

  await core.summary
    .addHeading(live ? "Stale PR triage" : "Stale PR triage (dry run: no PRs changed)")
    .addRaw(
      `${results.length} open PRs: ${results.length - onAuthor} waiting on review, ` +
        `${onAuthor} waiting on the author (${byKind.join(", ")}).`,
      true,
    )
    .addRaw(`${live ? "Updated" : "Would update"} the turn label on ${relabelled} PRs.`, true)
    .addTable([
      [
        { data: "PR", header: true },
        { data: "Author", header: true },
        { data: "Action", header: true },
        { data: "Waiting on author for", header: true },
      ],
      ...rows,
    ])
    .write();
}

export interface TriageInputs {
  github: GitHubClient;
  context: { repo: Repo };
  core: Core;
  /** false reports what would happen without commenting, labelling or closing. */
  live: boolean;
  /** Pause after each PR that was changed. Defaults to WRITE_INTERVAL_MS. */
  writeIntervalMs?: number;
}

function changeSummary({ decision, turnLabel }: Result) {
  const turnKinds = decision.turns.map((turn) => turn.kind).join(", ");
  const labelChanges = [...(turnLabel.add ? [`+${turnLabel.label}`] : []), ...turnLabel.remove.map((name) => `-${name}`)];
  return `${decision.action} (${turnKinds}); turn label ${labelChanges.join(" ") || "unchanged"}`;
}

/**
 * Triages every open PR. A write that fails is logged and the run moves on to the
 * next PR; the job is failed at the end. Always writes a job summary.
 */
export default async function triageStalePullRequests({
  github,
  context,
  core,
  live,
  writeIntervalMs = WRITE_INTERVAL_MS,
}: TriageInputs) {
  const now = Date.now();
  const results: Result[] = [];
  let failures = 0;

  for (const pr of await fetchOpenPullRequests(github, context.repo)) {
    const result = { pr, decision: decide(pr, now), turnLabel: turnLabelChange(pr) };
    results.push(result);
    if (!hasWrites(result) && result.decision.action !== "pending") continue;

    core.info(`#${pr.number}: ${changeSummary(result)}`);
    if (!live || !hasWrites(result)) continue;
    try {
      await apply(github, context.repo, pr, result.decision, now);
      if (needsRelabel(result)) await applyTurnLabel(github, context.repo, pr, result.turnLabel);
    } catch (error) {
      failures += 1;
      core.error(`#${pr.number}: ${changeSummary(result)} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(writeIntervalMs);
  }

  await writeSummary(core, results, live, now);
  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}
