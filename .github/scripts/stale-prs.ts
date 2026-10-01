// Stale PR triage and turn labels.
//
// The daily triage (.github/workflows/stale-prs.yml) warns a PR that has been waiting
// on its author for too long, and closes it if what the warning named is still
// outstanding CLOSE_AFTER_WARNING_DAYS later. A PR waiting on maintainers is never
// warned or closed. The turn-label sync (pr-turn-labels.yml, pr-conflict-labeler.yml)
// keeps waiting-on-author / waiting-on-review current between triages.

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

// GitHub asks for at least a second between writes to stay under its secondary rate
// limit, and the first run labels every open PR.
const WRITE_INTERVAL_MS = 1000;

// The same wait pr-conflict-labeler.yml gives GitHub to compute mergeability.
const MERGEABILITY_ATTEMPTS = 6;
const MERGEABILITY_RETRY_MS = 5000;

const CORE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const REVIEW_VERDICTS = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

// Records which turns a warning named, so the close acts on those and nothing else.
const WARNING_MARKER = /<!-- stale-pr-warning: ([A-Za-z,]*) -->/;

const PAGE_INFO = "pageInfo { hasPreviousPage startCursor }";

// Read newest first and paged back with $before until complete, so a label added or a
// reply posted long ago is never lost behind newer events.
const HISTORY = {
  reviews: `reviews(last: 100, before: $before) {
    ${PAGE_INFO}
    nodes { state submittedAt authorAssociation authorCanPushToRepository author { login __typename } }
  }`,
  comments: `comments(last: 100, before: $before) { ${PAGE_INFO} nodes { createdAt author { login } } }`,
  timelineItems: `timelineItems(
    last: 100
    before: $before
    itemTypes: [
      LABELED_EVENT
      UNLABELED_EVENT
      REOPENED_EVENT
      READY_FOR_REVIEW_EVENT
      CONVERT_TO_DRAFT_EVENT
      REVIEW_REQUESTED_EVENT
      HEAD_REF_FORCE_PUSHED_EVENT
    ]
  ) {
    ${PAGE_INFO}
    nodes {
      __typename
      ... on LabeledEvent { createdAt label { name } }
      ... on UnlabeledEvent { createdAt label { name } }
      ... on ReopenedEvent { createdAt }
      ... on ReadyForReviewEvent { createdAt actor { login } }
      ... on ConvertToDraftEvent { createdAt actor { login } }
      ... on ReviewRequestedEvent { createdAt actor { login } }
      ... on HeadRefForcePushedEvent { createdAt actor { login } }
    }
  }`,
};

type HistoryKey = keyof typeof HISTORY;

const WARNING_COMMENTS = `comments(last: 100, before: $before) {
  ${PAGE_INFO}
  nodes { createdAt body author { __typename } }
}`;

// Only the last few commits: the author's latest push is among them unless others
// have pushed many since, and then it is not what the PR is waiting on.
const PULL_REQUEST_FIELDS = `
  number
  state
  url
  isDraft
  mergeable
  baseRefName
  createdAt
  author { login __typename }
  labels(first: 100) { nodes { name } }
  commits(last: 10) {
    nodes { commit { committedDate author { user { login } } checkSuites(first: 10) { nodes { createdAt } } } }
  }
  ${HISTORY.reviews}
  ${HISTORY.comments}
  ${HISTORY.timelineItems}
`;

const OPEN_PULL_REQUESTS_QUERY = `
  query($owner: String!, $repo: String!, $cursor: String, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PULL_REQUEST_FIELDS} }
      }
    }
  }
`;

const pullRequestQuery = (selection: string) => `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) { ${selection} }
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
  authorCanPushToRepository: boolean;
  author: Author | null;
}

type SubmittedReview = Review & { submittedAt: string; author: Author };

export interface Comment {
  createdAt: string;
  author: Actor | null;
}

export interface Commit {
  committedDate: string;
  author: { user: Actor | null } | null;
  checkSuites: { nodes: { createdAt: string }[] };
}

export type TimelineEvent =
  | { __typename: "LabeledEvent" | "UnlabeledEvent"; createdAt: string; label: { name: string } }
  | { __typename: "ReopenedEvent"; createdAt: string }
  | {
      __typename: "ReadyForReviewEvent" | "ConvertToDraftEvent" | "ReviewRequestedEvent" | "HeadRefForcePushedEvent";
      createdAt: string;
      actor: Actor | null;
    };

type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export interface Page<T> {
  pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
  nodes: T[];
}

/** One PR as PULL_REQUEST_FIELDS returns it: must stay in sync with the selection. */
export interface PullRequestNode {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  isDraft: boolean;
  mergeable: Mergeable;
  baseRefName: string;
  createdAt: string;
  author: Author | null;
  labels: { nodes: { name: string }[] };
  commits: { nodes: { commit: Commit }[] };
  reviews: Page<Review>;
  comments: Page<Comment>;
  timelineItems: Page<TimelineEvent>;
}

interface WarningComment {
  createdAt: string;
  body: string;
  author: { __typename: string } | null;
}

/** A warning the triage posted: when, and which turns it named. */
export interface Warning {
  at: number;
  kinds: TurnKind[];
}

/** An open PR with its review, comment and timeline history complete. */
export interface PullRequest {
  number: number;
  url: string;
  isDraft: boolean;
  mergeable: Mergeable;
  baseRefName: string;
  createdAt: string;
  author: Author | null;
  labels: string[];
  commits: Commit[];
  reviews: Review[];
  comments: Comment[];
  timeline: TimelineEvent[];
  /** The newest warning on the PR. Only the triage reads it, and only under the Stale PR label; null otherwise. */
  warning: Warning | null;
}

interface PullRequestsPage {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: PullRequestNode[];
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

export interface LabelChange {
  add: string[];
  remove: string[];
}

interface Repo {
  owner: string;
  repo: string;
}

type IssueRef = Repo & { issue_number: number };
type CommentParams = IssueRef & { body: string };
type AddLabelsParams = IssueRef & { labels: string[] };
type RemoveLabelParams = IssueRef & { name: string };
type ClosePullParams = Repo & { pull_number: number; state: "closed" };

/** The parts of github-script's `github` client this script calls. */
export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  rest: {
    issues: {
      createComment(params: CommentParams): Promise<unknown>;
      addLabels(params: AddLabelsParams): Promise<unknown>;
      removeLabel(params: RemoveLabelParams): Promise<unknown>;
    };
    pulls: {
      get(params: Repo & { pull_number: number }): Promise<{ data: { mergeable: boolean | null } }>;
      list(params: Repo & { state: "open"; head: string }): Promise<{ data: { number: number }[] }>;
      update(params: ClosePullParams): Promise<unknown>;
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hasLabel(pr: PullRequest, name: string) {
  return pr.labels.includes(name);
}

function latestEvent(pr: PullRequest, matches: (event: TimelineEvent) => boolean) {
  return latest(pr.timeline.filter(matches).map((event) => time(event.createdAt)));
}

const labelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "LabeledEvent" && event.label.name === name;

const unlabelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "UnlabeledEvent" && event.label.name === name;

const isReopen = (event: TimelineEvent) => event.__typename === "ReopenedEvent";

// committedDate is when the commit was made, which can be days before the push; its
// check suites are created by the push itself.
function pushTime(commit: Commit) {
  const suites = commit.checkSuites.nodes.map((suite) => time(suite.createdAt));
  return suites.length > 0 ? Math.min(...suites) : time(commit.committedDate);
}

// Deliberately not updatedAt: label changes, CI comments and this bot all bump it.
function lastAuthorActivity(pr: PullRequest) {
  const author = pr.author?.login;
  const isAuthor = (actor: Actor | null) => author !== undefined && actor?.login === author;
  // A commit with no linked account may be the author's. One by someone else, such as
  // a maintainer's Update branch, is not the author responding.
  const authorCommits = pr.commits.filter((commit) => !commit.author?.user || isAuthor(commit.author.user));
  return Math.max(
    time(pr.createdAt),
    ...authorCommits.map(pushTime),
    ...pr.comments.filter((comment) => isAuthor(comment.author)).map((comment) => time(comment.createdAt)),
    ...pr.reviews.flatMap((review) =>
      review.submittedAt !== null && isAuthor(review.author) ? [time(review.submittedAt)] : [],
    ),
    ...pr.timeline.flatMap((event) => ("actor" in event && isAuthor(event.actor) ? [time(event.createdAt)] : [])),
  );
}

// The label's timestamp is when the conflict started. `mergeable` is often UNKNOWN
// while GitHub recomputes it, so it only overrides the label when the conflict is gone.
function conflictTurn(pr: PullRequest): Turn | null {
  if (pr.isDraft || pr.mergeable === "MERGEABLE" || !hasLabel(pr, LABELS.conflicts)) return null;
  const since = latestEvent(pr, labelled(LABELS.conflicts));
  return since === null ? null : { kind: "conflicts", since };
}

function isCoreReview(review: Review, prAuthor: string | undefined): review is SubmittedReview {
  return (
    review.submittedAt !== null &&
    review.author !== null &&
    review.author.__typename !== "Bot" &&
    review.author.login !== prAuthor &&
    // authorAssociation reads CONTRIBUTOR for a member whose membership is private.
    (review.authorCanPushToRepository || CORE_ASSOCIATIONS.has(review.authorAssociation)) &&
    REVIEW_VERDICTS.has(review.state)
  );
}

function reviewTurn(pr: PullRequest, authorActivity: number): Turn | null {
  if (pr.isDraft) return null;
  const reviews = pr.reviews
    .filter((candidate) => isCoreReview(candidate, pr.author?.login))
    .sort((a, b) => time(a.submittedAt) - time(b.submittedAt));
  // A comment after an approval is a nit, not a request: the approval still stands.
  if (reviews.findLast((review) => review.state !== "COMMENTED")?.state === "APPROVED") return null;
  const review = reviews.at(-1);
  if (!review) return null;
  const since = time(review.submittedAt);
  return since > authorActivity ? { kind: "review", since, reviewer: review.author.login } : null;
}

function needsChangesTurn(pr: PullRequest, authorActivity: number): Turn | null {
  if (pr.isDraft || !hasLabel(pr, LABELS.needsChanges)) return null;
  const since = latestEvent(pr, labelled(LABELS.needsChanges));
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

// The has conflicts label can be hours behind main, so a conflict is only warned or
// closed on once GitHub confirms it.
const isConfirmed = (turn: Turn, pr: PullRequest) => turn.kind !== "conflicts" || pr.mergeable === "CONFLICTING";

/** The warning behind the Stale PR label; null when the label was removed since, or added by hand. */
function activeWarning(pr: PullRequest) {
  if (!hasLabel(pr, LABELS.stale) || pr.warning === null) return null;
  const removedAt = latestEvent(pr, unlabelled(LABELS.stale));
  return removedAt === null || pr.warning.at > removedAt ? pr.warning : null;
}

/**
 * What to do with one PR at epoch ms `now`. `action` is one of:
 * - "none": nothing has been outstanding long enough to warn.
 * - "warn": post the warning naming `turns`, the ones now due, and add the Stale PR label.
 * - "pending": warned, and `turns` are still outstanding, but the close is not due or
 *   the conflict it would close on is unconfirmed.
 * - "close": warned CLOSE_AFTER_WARNING_DAYS ago and `turns` are still outstanding.
 * - "clear": warned, but resolved, reopened or exempted since; remove the label.
 *
 * A reopen, or the end of a warning however it ended, restarts every warning clock.
 */
export function decide(pr: PullRequest, now: number): Decision {
  if (pr.author?.__typename === "Bot" || hasLabel(pr, LABELS.onHold)) {
    return { action: hasLabel(pr, LABELS.stale) ? "clear" : "none", turns: [] };
  }

  const turns = authorTurns(pr);
  const warning = activeWarning(pr);
  if (warning === null) {
    const restartedAt = latestEvent(pr, (event) => isReopen(event) || unlabelled(LABELS.stale)(event)) ?? 0;
    const due = turns.filter(
      (turn) =>
        isConfirmed(turn, pr) && now - Math.max(turn.since, restartedAt) >= WARN_AFTER_DAYS[turn.kind] * DAY_MS,
    );
    return { action: due.length > 0 ? "warn" : "none", turns: due };
  }

  const reopenedAt = latestEvent(pr, isReopen);
  // A turn that started after the warning is one the author was never warned about.
  const warnedTurns = turns.filter((turn) => warning.kinds.includes(turn.kind) && turn.since <= warning.at);
  if (warnedTurns.length === 0 || (reopenedAt !== null && reopenedAt > warning.at)) {
    return { action: "clear", turns };
  }
  const closable = warnedTurns.filter((turn) => isConfirmed(turn, pr));
  const closeDue = now - warning.at >= CLOSE_AFTER_WARNING_DAYS * DAY_MS;
  return closeDue && closable.length > 0
    ? { action: "close", turns: closable }
    : { action: "pending", turns: warnedTurns };
}

/**
 * The labels an open PR should carry. Every open PR gets a turn label, bots and on-hold
 * included: those are exempt from closing, not from having a turn. Approved-but-unmerged
 * counts as waiting on review. backlog-cleanup describes a closed PR, so a reopened one
 * loses it.
 */
export function labelChange(pr: PullRequest): LabelChange {
  const turnLabel = authorTurns(pr).length > 0 ? LABELS.waitingOnAuthor : LABELS.waitingOnReview;
  const unwanted = [LABELS.waitingOnAuthor, LABELS.waitingOnReview, LABELS.backlogCleanup].filter(
    (name) => name !== turnLabel,
  );
  return {
    add: hasLabel(pr, turnLabel) ? [] : [turnLabel],
    remove: unwanted.filter((name) => hasLabel(pr, name)),
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
      return "A reply, a new push or re-requesting review keeps it open.";
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
    "",
    `<!-- stale-pr-warning: ${turns.map((turn) => turn.kind).join(",")} -->`,
  ].join("\n");
}

export function closingComment(pr: PullRequest, turns: Turn[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR has been closed automatically because it was still waiting on you ${CLOSE_AFTER_WARNING_DAYS} days after the reminder:`,
    "",
    ...turns.map((turn) => `- ${problem(turn, pr, now)}`),
    "",
    "Thanks for the contribution! If you pick this up again, reopen it (or ask here and a maintainer will) and fix the above.",
  ].join("\n");
}

const isTurnKind = (kind: string): kind is TurnKind => Object.hasOwn(WARN_AFTER_DAYS, kind);

// Bots only: anyone else could post a marker naming nothing, and stall the close.
function parseWarning(comment: WarningComment): Warning | null {
  const match = comment.author?.__typename === "Bot" ? WARNING_MARKER.exec(comment.body) : null;
  if (!match) return null;
  return { at: time(comment.createdAt), kinds: (match[1] ?? "").split(",").filter(isTurnKind) };
}

async function fetchOpenPullRequests(github: GitHubClient, repo: Repo) {
  const pullRequests: PullRequestNode[] = [];
  let cursor: string | null = null;
  do {
    const page: PullRequestsPage = await github.graphql(OPEN_PULL_REQUESTS_QUERY, { ...repo, cursor });
    const { nodes, pageInfo } = page.repository.pullRequests;
    pullRequests.push(...nodes);
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);
  return pullRequests;
}

/** The PR as it is now; null once it is closed or merged. */
async function fetchPullRequest(github: GitHubClient, repo: Repo, number: number) {
  const page = await github.graphql<{ repository: { pullRequest: PullRequestNode | null } }>(
    pullRequestQuery(PULL_REQUEST_FIELDS),
    { ...repo, number },
  );
  const node = page.repository.pullRequest;
  return node?.state === "OPEN" ? node : null;
}

async function previousPage<K extends string, T>(
  github: GitHubClient,
  repo: Repo,
  number: number,
  key: K,
  selection: string,
  before: string | null,
) {
  const page = await github.graphql<{ repository: { pullRequest: Record<K, Page<T>> } }>(pullRequestQuery(selection), {
    ...repo,
    number,
    before,
  });
  return page.repository.pullRequest[key];
}

async function completeHistory<K extends HistoryKey, T>(
  github: GitHubClient,
  repo: Repo,
  number: number,
  key: K,
  newest: Page<T>,
) {
  const nodes = [...newest.nodes];
  let { pageInfo } = newest;
  while (pageInfo.hasPreviousPage) {
    const page: Page<T> = await previousPage<K, T>(github, repo, number, key, HISTORY[key], pageInfo.startCursor);
    nodes.unshift(...page.nodes);
    pageInfo = page.pageInfo;
  }
  return nodes;
}

async function loadPullRequest(github: GitHubClient, repo: Repo, node: PullRequestNode): Promise<PullRequest> {
  const { number } = node;
  return {
    number,
    url: node.url,
    isDraft: node.isDraft,
    mergeable: node.mergeable,
    baseRefName: node.baseRefName,
    createdAt: node.createdAt,
    author: node.author,
    labels: node.labels.nodes.map((label) => label.name),
    commits: node.commits.nodes.map(({ commit }) => commit),
    reviews: await completeHistory(github, repo, number, "reviews", node.reviews),
    comments: await completeHistory(github, repo, number, "comments", node.comments),
    timeline: await completeHistory(github, repo, number, "timelineItems", node.timelineItems),
    warning: null,
  };
}

async function fetchMergeable(github: GitHubClient, repo: Repo, number: number, retryMs: number) {
  for (let attempt = 1; attempt <= MERGEABILITY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(retryMs);
    const { data } = await github.rest.pulls.get({ ...repo, pull_number: number });
    if (data.mergeable !== null) return data.mergeable ? "MERGEABLE" : "CONFLICTING";
  }
  return "UNKNOWN";
}

async function fetchLatestWarning(github: GitHubClient, repo: Repo, number: number) {
  let before: string | null = null;
  do {
    const page: Page<WarningComment> = await previousPage<"comments", WarningComment>(
      github,
      repo,
      number,
      "comments",
      WARNING_COMMENTS,
      before,
    );
    const warning = page.nodes.map(parseWarning).findLast((parsed) => parsed !== null);
    if (warning) return warning;
    before = page.pageInfo.hasPreviousPage ? page.pageInfo.startCursor : null;
  } while (before !== null);
  return null;
}

async function loadForTriage(github: GitHubClient, repo: Repo, node: PullRequestNode, retryMs: number) {
  const pr = await loadPullRequest(github, repo, node);
  const unconfirmedConflict = pr.mergeable === "UNKNOWN" && !pr.isDraft && hasLabel(pr, LABELS.conflicts);
  return {
    ...pr,
    mergeable: unconfirmedConflict ? await fetchMergeable(github, repo, pr.number, retryMs) : pr.mergeable,
    warning: hasLabel(pr, LABELS.stale) ? await fetchLatestWarning(github, repo, pr.number) : null,
  };
}

/** `github` with its writes spaced at least `intervalMs` apart. Reads are not delayed. */
function pacedWrites(github: GitHubClient, intervalMs: number): GitHubClient {
  let nextWriteAt = 0;
  const paced =
    <P, R>(write: (params: P) => Promise<R>) =>
    async (params: P) => {
      const wait = nextWriteAt - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await write(params);
      } finally {
        nextWriteAt = Date.now() + intervalMs;
      }
    };
  return {
    graphql: github.graphql.bind(github),
    rest: {
      issues: {
        createComment: paced((params: CommentParams) => github.rest.issues.createComment(params)),
        addLabels: paced((params: AddLabelsParams) => github.rest.issues.addLabels(params)),
        removeLabel: paced((params: RemoveLabelParams) => github.rest.issues.removeLabel(params)),
      },
      pulls: {
        get: (params) => github.rest.pulls.get(params),
        list: (params) => github.rest.pulls.list(params),
        update: paced((params: ClosePullParams) => github.rest.pulls.update(params)),
      },
    },
  };
}

const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

// Someone, or an overlapping run, may have removed it since the PR was read.
async function removeLabel(github: GitHubClient, issue: IssueRef, name: string) {
  await github.rest.issues.removeLabel({ ...issue, name }).catch((error: unknown) => {
    if (!isNotFound(error)) throw error;
  });
}

// Comment before labelling, and before closing: if the second call fails, the next
// run repeats a comment rather than closing a PR whose author was never told.
async function applyDecision(github: GitHubClient, issue: IssueRef, pr: PullRequest, decision: Decision, now: number) {
  switch (decision.action) {
    case "warn":
      await github.rest.issues.createComment({ ...issue, body: warningComment(pr, decision.turns, now) });
      await github.rest.issues.addLabels({ ...issue, labels: [LABELS.stale] });
      break;
    case "close":
      await github.rest.issues.createComment({ ...issue, body: closingComment(pr, decision.turns, now) });
      await github.rest.issues.addLabels({ ...issue, labels: [LABELS.backlogCleanup] });
      await github.rest.pulls.update({ owner: issue.owner, repo: issue.repo, pull_number: pr.number, state: "closed" });
      break;
    case "clear":
      await removeLabel(github, issue, LABELS.stale);
      break;
  }
}

async function applyLabelChange(github: GitHubClient, issue: IssueRef, change: LabelChange) {
  if (change.add.length > 0) await github.rest.issues.addLabels({ ...issue, labels: change.add });
  for (const name of change.remove) await removeLabel(github, issue, name);
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
  labels: LabelChange;
}

const changesLabels = (change: LabelChange) => change.add.length > 0 || change.remove.length > 0;

// A PR being closed keeps whatever labels it had: relabelling it is noise.
const needsRelabel = ({ decision, labels }: Result) => decision.action !== "close" && changesLabels(labels);

const hasWrites = (result: Result) =>
  needsRelabel(result) || ["warn", "close", "clear"].includes(result.decision.action);

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
    .addRaw(`${live ? "Updated" : "Would update"} the labels on ${relabelled} PRs.`, true)
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

function labelChangeSummary(change: LabelChange) {
  const changes = [...change.add.map((name) => `+${name}`), ...change.remove.map((name) => `-${name}`)];
  return `labels ${changes.join(" ") || "unchanged"}`;
}

function changeSummary({ decision, labels }: Result) {
  const turnKinds = decision.turns.map((turn) => turn.kind).join(", ");
  return `${decision.action} (${turnKinds}); ${labelChangeSummary(labels)}`;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs `visit` on each PR in turn. One that throws is logged and skipped; returns how many threw. */
async function eachLogged<T extends { number: number }>(core: Core, prs: T[], visit: (pr: T) => Promise<void>) {
  let failures = 0;
  for (const pr of prs) {
    try {
      await visit(pr);
    } catch (error) {
      failures += 1;
      core.error(`#${pr.number}: ${errorMessage(error)}`);
    }
  }
  return failures;
}

interface RunInputs {
  github: GitHubClient;
  context: { repo: Repo };
  core: Core;
  /** false reports what would happen without commenting, labelling or closing. */
  live: boolean;
  /** Least pause between writes. Defaults to WRITE_INTERVAL_MS. */
  writeIntervalMs?: number;
}

export interface TriageInputs extends RunInputs {
  /** Pause between mergeability checks on an unconfirmed conflict. Defaults to MERGEABILITY_RETRY_MS. */
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
  const client = pacedWrites(github, writeIntervalMs);
  const evaluate = async (node: PullRequestNode): Promise<Result> => {
    const pr = await loadForTriage(github, repo, node, mergeabilityRetryMs);
    return { pr, decision: decide(pr, now), labels: labelChange(pr) };
  };
  const results: Result[] = [];

  const failures = await eachLogged(core, await fetchOpenPullRequests(github, repo), async (node) => {
    let result = await evaluate(node);
    if (live && hasWrites(result)) {
      // Decided again on a fresh read: the listing can be minutes old by now, and a
      // turn-label sync may have moved the PR on since.
      const fresh = await fetchPullRequest(github, repo, node.number);
      if (fresh === null) return;
      result = await evaluate(fresh);
    }
    results.push(result);
    if (!hasWrites(result) && result.decision.action !== "pending") return;

    core.info(`#${node.number}: ${changeSummary(result)}`);
    if (!live) return;
    const issue = { ...repo, issue_number: node.number };
    await applyDecision(client, issue, result.pr, result.decision, now);
    if (needsRelabel(result)) await applyLabelChange(client, issue, result.labels);
  });

  await writeSummary(core, results, live, now);
  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}

export interface SyncInputs extends RunInputs {
  pullNumbers: number[] | "all";
}

/**
 * Brings the labels from labelChange up to date on the given open PRs, or on every
 * open PR, and touches nothing else. Fails the same way as the triage, without
 * writing a summary.
 */
export async function syncTurnLabels({
  github,
  context,
  core,
  live,
  pullNumbers,
  writeIntervalMs = WRITE_INTERVAL_MS,
}: SyncInputs) {
  const { repo } = context;
  const client = pacedWrites(github, writeIntervalMs);
  const targets: { number: number; listed: PullRequestNode | null }[] =
    pullNumbers === "all"
      ? (await fetchOpenPullRequests(github, repo)).map((node) => ({ number: node.number, listed: node }))
      : pullNumbers.map((number) => ({ number, listed: null }));

  const failures = await eachLogged(core, targets, async ({ number, listed }) => {
    // A listed PR is read again before writing: the listing can be minutes old by then.
    if (listed && !changesLabels(labelChange(await loadPullRequest(github, repo, listed)))) return;
    const node = await fetchPullRequest(github, repo, number);
    if (node === null) return;
    const change = labelChange(await loadPullRequest(github, repo, node));
    if (!changesLabels(change)) return;

    core.info(`#${number}: ${labelChangeSummary(change)}`);
    if (live) await applyLabelChange(client, { ...repo, issue_number: number }, change);
  });

  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}

/** The parts of a github-script `context.payload` that name a PR. */
export interface EventPayload {
  pull_request?: { number: number };
  issue?: { number: number; pull_request?: unknown };
  workflow_run?: {
    pull_requests: { number: number }[];
    head_branch: string | null;
    head_repository: { owner: { login: string } } | null;
  };
}

/** The PRs the triggering event is about, or "all" for an event that names none, such as a schedule. */
export async function pullNumbersForEvent(
  github: GitHubClient,
  { repo, payload }: { repo: Repo; payload: EventPayload },
): Promise<number[] | "all"> {
  if (payload.pull_request) return [payload.pull_request.number];
  if (payload.issue) return payload.issue.pull_request ? [payload.issue.number] : [];
  const run = payload.workflow_run;
  if (!run) return "all";
  if (run.pull_requests.length > 0) return run.pull_requests.map((pr) => pr.number);
  // workflow_run leaves pull_requests empty for a fork's PR, so find it by its head.
  if (!run.head_repository || !run.head_branch) return [];
  const { data } = await github.rest.pulls.list({
    ...repo,
    state: "open",
    head: `${run.head_repository.owner.login}:${run.head_branch}`,
  });
  return data.map((pr) => pr.number);
}
