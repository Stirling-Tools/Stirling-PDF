// Stale PR triage, run daily by .github/workflows/stale-prs.yml.

import {
  BOT_LOGIN,
  CLOSE_AFTER_WARNING_DAYS,
  type Core,
  type GitHubClient,
  type IssueRef,
  LABELS,
  type PullData,
  type Repo,
  removeLabel,
} from "./github.ts";
import { enforceSizeLimit, MAX_LINES, type SizedPullRequest } from "./pr-size.ts";
import { clearStaleTurnLabel } from "./pr-turn.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Reason = "conflicts" | "waitingOnAuthor" | "idleDraft" | "tooLarge";

const TURN_LABELS: { label: string; reason: Reason }[] = [
  { label: LABELS.conflicts, reason: "conflicts" },
  { label: LABELS.waitingOnAuthor, reason: "waitingOnAuthor" },
];

export const TURN_DAYS = 7;
export const IDLE_DRAFT_DAYS = 30;

// GitHub asks for at least a second between writes to stay under its secondary rate limit.
const WRITE_INTERVAL_MS = 1000;

// The same wait pr-conflict-labeler.yml gives GitHub to compute mergeability.
const MERGEABILITY_ATTEMPTS = 7;
const MERGEABILITY_RETRY_MS = 5000;

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

const TIMELINE_ITEMS = `
  timelineItems(
    last: 100
    before: $before
    itemTypes: [LABELED_EVENT, UNLABELED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]
  ) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      __typename
      ... on LabeledEvent { createdAt label { name } actor { login __typename } }
      ... on UnlabeledEvent { createdAt label { name } actor { login __typename } }
      ... on ReopenedEvent { createdAt actor { login __typename } }
      ... on ReadyForReviewEvent { createdAt actor { login __typename } }
      ... on ConvertToDraftEvent { createdAt actor { login __typename } }
    }
  }
`;

// `activity` is the newest 100 only, which is plenty to find a person among the bots.
const PULL_REQUEST_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        state
        url
        isDraft
        createdAt
        baseRefName
        additions
        deletions
        authorAssociation
        author { login __typename }
        labels(first: 100) { nodes { name } }
        commits(last: 1) { nodes { commit { committedDate } } }
        activity: timelineItems(last: 100, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, HEAD_REF_FORCE_PUSHED_EVENT]) {
          nodes {
            __typename
            ... on IssueComment { createdAt author { login __typename } }
            ... on PullRequestReview { submittedAt author { login __typename } }
            ... on HeadRefForcePushedEvent { createdAt actor { login __typename } }
          }
        }
        ${TIMELINE_ITEMS}
      }
    }
  }
`;

const OLDER_TIMELINE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        ${TIMELINE_ITEMS}
      }
    }
  }
`;

export interface Actor {
  login: string;
  __typename: string;
}

export type TimelineEvent =
  | { __typename: "LabeledEvent" | "UnlabeledEvent"; createdAt: string; label: { name: string }; actor: Actor | null }
  | { __typename: "ReopenedEvent" | "ReadyForReviewEvent" | "ConvertToDraftEvent"; createdAt: string; actor: Actor | null };

export type ActivityItem =
  | { __typename: "IssueComment"; createdAt: string; author: Actor | null }
  | { __typename: "PullRequestReview"; submittedAt: string | null; author: Actor | null }
  | { __typename: "HeadRefForcePushedEvent"; createdAt: string; actor: Actor | null };

interface TimelinePage {
  pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
  nodes: TimelineEvent[];
}

/** One PR as PULL_REQUEST_QUERY returns it: must stay in sync with the query. */
export interface PullRequestNode {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  isDraft: boolean;
  createdAt: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  authorAssociation: string;
  author: Actor | null;
  labels: { nodes: { name: string }[] };
  commits: { nodes: { commit: { committedDate: string } }[] };
  activity: { nodes: ActivityItem[] };
  timelineItems: TimelinePage;
}

/** An open PR with its complete label, reopen and draft history. */
export interface PullRequest {
  number: number;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  additions: number;
  deletions: number;
  authorAssociation: string;
  author: Actor | null;
  labels: string[];
  timeline: TimelineEvent[];
  /** When a person last did anything on it; see latestActivity. */
  lastActivityAt: string;
}

export type Action = "none" | "warn" | "pending" | "close" | "resume" | "clear";

export interface Decision {
  action: Action;
  reasons: Reason[];
}

const time = (iso: string) => Date.parse(iso);
const days = (ms: number) => Math.floor(ms / DAY_MS);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasLabel = (pr: PullRequest, name: string) => pr.labels.includes(name);
const byPerson = (actor: Actor | null) => actor?.__typename !== "Bot";
const byTriageBot = (actor: Actor | null) => actor?.__typename === "Bot" && actor.login === BOT_LOGIN;

function lastEvent(pr: PullRequest, matches: (event: TimelineEvent) => boolean) {
  return pr.timeline
    .filter(matches)
    .reduce<TimelineEvent | null>((last, event) => (last === null || time(event.createdAt) >= time(last.createdAt) ? event : last), null);
}

function latestEvent(pr: PullRequest, matches: (event: TimelineEvent) => boolean) {
  const event = lastEvent(pr, matches);
  return event === null ? null : time(event.createdAt);
}

const labelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "LabeledEvent" && event.label.name === name;

const unlabelled = (name: string) => (event: TimelineEvent) =>
  event.__typename === "UnlabeledEvent" && event.label.name === name;

const reopened = (event: TimelineEvent) => event.__typename === "ReopenedEvent";

const becameReady = (event: TimelineEvent) => reopened(event) || event.__typename === "ReadyForReviewEvent";

const changedState = (event: TimelineEvent) => becameReady(event) || event.__typename === "ConvertToDraftEvent";

// What ends a warning on a ready PR: a turn label removed, a reopen, or a switch to draft and back.
const endsWarning = (event: TimelineEvent) =>
  changedState(event) || TURN_LABELS.some(({ label }) => unlabelled(label)(event));

/** When the triage's warning was posted; null without Stale PR, or when someone else added it. */
function warningTime(pr: PullRequest) {
  if (!hasLabel(pr, LABELS.stale)) return null;
  const added = lastEvent(pr, labelled(LABELS.stale));
  return added !== null && byTriageBot(added.actor) ? time(added.createdAt) : null;
}

// Removing a warning, by hand or by a clear, restarts the clock; dropping a Stale PR
// label someone else added does not, as it was never a warning.
function lastWarningEndedAt(pr: PullRequest) {
  let warning = false;
  let endedAt: number | null = null;
  for (const event of [...pr.timeline].sort((a, b) => time(a.createdAt) - time(b.createdAt))) {
    if (labelled(LABELS.stale)(event)) {
      warning = byTriageBot(event.actor);
    } else if (unlabelled(LABELS.stale)(event)) {
      if (warning) endedAt = time(event.createdAt);
      warning = false;
    }
  }
  return endedAt;
}

// A close labels the PR backlog-cleanup before closing it, so one still open with that
// label added since the warning, and not reopened since, stopped partway.
function closeInterrupted(pr: PullRequest, warnedAt: number) {
  const closingAt = latestEvent(pr, labelled(LABELS.backlogCleanup));
  return hasLabel(pr, LABELS.backlogCleanup) && closingAt !== null && closingAt >= warnedAt && (latestEvent(pr, reopened) ?? 0) < closingAt;
}

const NONE: Decision = { action: "none", reasons: [] };
const CLEAR: Decision = { action: "clear", reasons: [] };

const closeOrPending = (now: number, warnedAt: number, reasons: Reason[]): Decision => ({
  action: now - warnedAt >= CLOSE_AFTER_WARNING_DAYS * DAY_MS ? "close" : "pending",
  reasons,
});

function decideReady(pr: PullRequest, now: number, warnedAt: number | null): Decision {
  // A turn only counts while the PR is open and ready.
  const readyAt = latestEvent(pr, becameReady) ?? 0;
  const restartedAt = lastWarningEndedAt(pr) ?? 0;
  const turns = TURN_LABELS.filter(({ label }) => hasLabel(pr, label)).map(({ label, reason }) => ({
    reason,
    since: Math.max(latestEvent(pr, labelled(label)) ?? now, readyAt, restartedAt),
  }));
  const dueAt = (at: number) => turns.filter((turn) => at - turn.since >= TURN_DAYS * DAY_MS).map((turn) => turn.reason);

  if (warnedAt === null) {
    const due = dueAt(now);
    return due.length > 0 ? { action: "warn", reasons: due } : NONE;
  }

  // Only what was due when it warned: a turn that started later was not in the warning.
  const warned = dueAt(warnedAt);
  const endedAt = latestEvent(pr, endsWarning);
  if (warned.length === 0 || (endedAt !== null && endedAt > warnedAt)) return CLEAR;
  return closeOrPending(now, warnedAt, warned);
}

function decideDraft(pr: PullRequest, now: number, warnedAt: number | null): Decision {
  const activeAt = time(pr.lastActivityAt);
  if (warnedAt === null) {
    return now - activeAt >= IDLE_DRAFT_DAYS * DAY_MS ? { action: "warn", reasons: ["idleDraft"] } : NONE;
  }
  const changedAt = latestEvent(pr, changedState) ?? 0;
  if (Math.max(activeAt, changedAt) > warnedAt) return CLEAR;
  return closeOrPending(now, warnedAt, ["idleDraft"]);
}

/**
 * What to do with one PR at epoch ms `now`. `action` is one of:
 * - "none": nothing has been outstanding long enough to warn.
 * - "warn": post the warning naming `reasons` and add the Stale PR label.
 * - "pending": warned, `reasons` still stand, and the close is not due yet.
 * - "close": warned CLOSE_AFTER_WARNING_DAYS ago and `reasons` still stand.
 * - "resume": a close stopped after its comment; close the PR without commenting again.
 * - "clear": warned, but something has changed since; remove the label.
 *
 * A too-large PR was warned when the label went on, by pr-size.ts's comment, so it is
 * "pending" until CLOSE_AFTER_WARNING_DAYS later and then "close". Conflicts still need
 * confirming with GitHub before acting; see confirmConflicts.
 */
export function decide(pr: PullRequest, now: number): Decision {
  const stale = hasLabel(pr, LABELS.stale);
  if (pr.author?.__typename === "Bot" || hasLabel(pr, LABELS.onHold)) return stale ? CLEAR : NONE;
  const warnedAt = warningTime(pr);
  const sizeWarnedAt = hasLabel(pr, LABELS.tooLarge) ? (latestEvent(pr, labelled(LABELS.tooLarge)) ?? now) : null;
  const warnings = [warnedAt, sizeWarnedAt].filter((at) => at !== null);
  if (warnings.length > 0 && closeInterrupted(pr, Math.min(...warnings))) return { action: "resume", reasons: [] };
  const size = sizeWarnedAt === null ? null : closeOrPending(now, sizeWarnedAt, ["tooLarge"]);
  if (size?.action === "close") return size;
  const decision = pr.isDraft ? decideDraft(pr, now, warnedAt) : decideReady(pr, now, warnedAt);
  // A Stale PR label someone else added warned nobody: replace it with a warning when one
  // is due, and drop it otherwise.
  const settled = stale && warnedAt === null && decision.action === "none" ? CLEAR : decision;
  return settled.action === "none" && size !== null ? size : settled;
}

function problem(reason: Reason, pr: PullRequest, now: number): string {
  switch (reason) {
    case "conflicts":
      return `It has merge conflicts with \`${pr.baseRefName}\`.`;
    case "waitingOnAuthor":
      return "A maintainer is waiting on a response from you.";
    case "idleDraft":
      return `It has been a draft with no activity for ${days(now - time(pr.lastActivityAt))} days.`;
    case "tooLarge":
      return `It changes more than ${MAX_LINES} lines, the limit for contributors outside the team.`;
  }
}

function remedy(reason: Reason, pr: PullRequest): string {
  switch (reason) {
    case "conflicts":
      return `Merging or rebasing onto \`${pr.baseRefName}\` resolves them.`;
    case "waitingOnAuthor":
      return "Please add a comment, a new push or re-request review.";
    case "idleDraft":
      return "Any activity keeps it open, such as a push, a comment or marking it ready for review.";
    case "tooLarge":
      return "Please split it into smaller PRs.";
  }
}

const authorLogin = (pr: PullRequest) => pr.author?.login ?? "ghost";

const sizedPullRequest = (pr: PullRequest): SizedPullRequest => ({
  number: pr.number,
  state: "open",
  additions: pr.additions,
  deletions: pr.deletions,
  author_association: pr.authorAssociation,
  user: { login: authorLogin(pr), type: pr.author?.__typename === "Bot" ? "Bot" : "User" },
  labels: pr.labels.map((name) => ({ name })),
});

export function warningComment(pr: PullRequest, reasons: Reason[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR has been marked as being stale because:`,
    "",
    ...reasons.map((reason) => `- ${problem(reason, pr, now)} ${remedy(reason, pr)}`),
    "",
    `If this is still outstanding in ${CLOSE_AFTER_WARNING_DAYS} days, the PR will be closed automatically.`,
    "If you think it's actually waiting on us rather than you, just add a comment so a maintainer can take a look.",
  ].join("\n");
}

export function closingComment(pr: PullRequest, reasons: Reason[], now: number) {
  return [
    `Hi @${authorLogin(pr)}, this PR has been closed automatically because the following issues haven't been resolved within ${CLOSE_AFTER_WARNING_DAYS} days of the reminder:`,
    "",
    ...reasons.map((reason) => `- ${problem(reason, pr, now)}`),
    "",
    "Thanks for the contribution! If you pick this up again, please feel free to open a new PR and fix the above issues.",
  ].join("\n");
}

function activityTime(item: ActivityItem) {
  switch (item.__typename) {
    case "IssueComment":
      return byPerson(item.author) ? item.createdAt : null;
    case "PullRequestReview":
      return byPerson(item.author) ? item.submittedAt : null;
    case "HeadRefForcePushedEvent":
      return byPerson(item.actor) ? item.createdAt : null;
  }
}

/**
 * When a person last opened, pushed to, commented on, reviewed, labelled or changed the
 * state of the PR. Bots don't count, this triage included. GitHub records no push time,
 * so a push counts from its newest commit's date: commits made long before they were
 * pushed look old.
 */
export function latestActivity(node: PullRequestNode, timeline: TimelineEvent[]) {
  const times = [
    node.createdAt,
    ...node.commits.nodes.map((pullCommit) => pullCommit.commit.committedDate),
    ...node.activity.nodes.map(activityTime),
    ...timeline.filter((event) => byPerson(event.actor)).map((event) => event.createdAt),
  ];
  return new Date(Math.max(...times.flatMap((iso) => (iso === null ? [] : [time(iso)])))).toISOString();
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

/** The PR with its whole timeline; null once it is closed or merged. */
async function fetchPullRequest(github: GitHubClient, repo: Repo, number: number): Promise<PullRequest | null> {
  const page = await github.graphql<{ repository: { pullRequest: PullRequestNode | null } }>(PULL_REQUEST_QUERY, {
    ...repo,
    number,
  });
  const node = page.repository.pullRequest;
  if (node?.state !== "OPEN") return null;
  const timeline = [...node.timelineItems.nodes];
  let { pageInfo } = node.timelineItems;
  while (pageInfo.hasPreviousPage) {
    const older = await github.graphql<{ repository: { pullRequest: { timelineItems: TimelinePage } | null } }>(
      OLDER_TIMELINE_QUERY,
      { ...repo, number, before: pageInfo.startCursor },
    );
    const items = older.repository.pullRequest?.timelineItems;
    if (!items) break;
    timeline.unshift(...items.nodes);
    pageInfo = items.pageInfo;
  }
  return {
    number: node.number,
    url: node.url,
    isDraft: node.isDraft,
    baseRefName: node.baseRefName,
    additions: node.additions,
    deletions: node.deletions,
    authorAssociation: node.authorAssociation,
    author: node.author,
    labels: node.labels.nodes.map((label) => label.name),
    timeline,
    lastActivityAt: latestActivity(node, timeline),
  };
}

// Must match hasConflicts in pr-conflict-labeler.yml, the owner of the label this confirms.
const conflicting = (pull: PullData) => pull.mergeable === false && pull.mergeable_state === "dirty";

async function confirmedConflicting(github: GitHubClient, repo: Repo, number: number, retryMs: number) {
  for (let attempt = 1; attempt <= MERGEABILITY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(retryMs);
    const { data } = await github.rest.pulls.get({ ...repo, pull_number: number });
    if (data.mergeable !== null) return conflicting(data);
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

// Applies a label change to the PR as read, so the decision sees it even in a dry run.
function withLabel(pr: PullRequest, name: string, present: boolean, now: number): PullRequest {
  const change: TimelineEvent = {
    __typename: present ? "LabeledEvent" : "UnlabeledEvent",
    createdAt: new Date(now).toISOString(),
    label: { name },
    actor: { login: BOT_LOGIN, __typename: "Bot" },
  };
  const others = pr.labels.filter((label) => label !== name);
  return { ...pr, labels: present ? [...others, name] : others, timeline: [...pr.timeline, change] };
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
  const close = () => pulls.update({ owner: issue.owner, repo: issue.repo, pull_number: pr.number, state: "closed" });
  switch (decision.action) {
    case "warn":
      await paced(intervalMs, [
        () => issues.createComment({ ...issue, body: warningComment(pr, decision.reasons, now) }),
        // A Stale PR label someone else added has to go first, so the warning's own label
        // is the one that dates it.
        ...(hasLabel(pr, LABELS.stale) ? [() => removeLabel(github, issue, LABELS.stale)] : []),
        () => issues.addLabels({ ...issue, labels: [LABELS.stale] }),
      ]);
      break;
    case "close":
      await paced(intervalMs, [
        () => issues.createComment({ ...issue, body: closingComment(pr, decision.reasons, now) }),
        () => issues.addLabels({ ...issue, labels: [LABELS.backlogCleanup] }),
        close,
      ]);
      break;
    case "resume":
      await close();
      break;
    case "clear":
      await removeLabel(github, issue, LABELS.stale);
      break;
  }
}

const ACTION_ORDER: Action[] = ["close", "resume", "warn", "clear", "pending"];
const WRITES: Action[] = ["warn", "close", "resume", "clear"];

interface Result {
  pr: PullRequest;
  decision: Decision;
  failed: boolean;
}

async function writeSummary(core: Core, results: Result[], live: boolean) {
  const rows = results
    .filter(({ decision }) => decision.action !== "none")
    .sort((a, b) => ACTION_ORDER.indexOf(a.decision.action) - ACTION_ORDER.indexOf(b.decision.action))
    .map(({ pr, decision, failed }) => [
      `<a href="${pr.url}">#${pr.number}</a>`,
      authorLogin(pr),
      failed ? `${decision.action} (failed)` : decision.action,
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
 * Triages every open PR, holding each to the size limit first, and writes a job summary.
 * A PR that cannot be read or updated is logged and skipped, and the job is failed at
 * the end. Throws if the open PRs cannot be listed.
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
    const issue = { ...repo, issue_number: number };
    let result: Result | null = null;
    try {
      let pr = await fetchPullRequest(github, repo, number);
      if (pr === null) continue;
      if (!pr.isDraft && hasLabel(pr, LABELS.waitingOnAuthor) && (await clearStaleTurnLabel(github, issue, live))) {
        core.info(`#${number}: -${LABELS.waitingOnAuthor} (the turn had already moved on)`);
        pr = withLabel(pr, LABELS.waitingOnAuthor, false, now);
      }
      const size = await enforceSizeLimit(github, repo, sizedPullRequest(pr), live);
      if (size.held !== hasLabel(pr, LABELS.tooLarge)) {
        core.info(`#${number}: ${size.held ? "+" : "-"}${LABELS.tooLarge}`);
        pr = withLabel(pr, LABELS.tooLarge, size.held, now);
      }
      const decision = await confirmConflicts(github, repo, pr, decide(pr, now), mergeabilityRetryMs);
      result = { pr, decision, failed: false };

      if (decision.action !== "none") core.info(`#${number}: ${decision.action} (${decision.reasons.join(", ")})`);
      if (live && WRITES.includes(decision.action)) {
        await apply(github, issue, pr, decision, now, writeIntervalMs);
        await sleep(writeIntervalMs);
      }
      results.push(result);
    } catch (error) {
      failures += 1;
      core.error(`#${number}: ${errorMessage(error)}`);
      if (result !== null) results.push({ ...result, failed: true });
    }
  }

  await writeSummary(core, results, live);
  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}
