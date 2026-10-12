// Holds a PR from someone outside the team to MAX_LINES. pr-size-limit.yml runs it as
// the PR changes, and the daily triage runs it on every open PR, then closes one that
// has been too-large for CLOSE_AFTER_WARNING_DAYS. An oversized PR fails the check, is
// labelled too-large and gets one comment saying why, kept up to date as the PR changes;
// the label's age is the warning's. Anyone who can push, bots and PRs labelled
// large-pr-approved are exempt. This file owns too-large and no other label.

import {
  CLOSE_AFTER_WARNING_DAYS,
  type CanPush,
  type Core,
  type GitHubClient,
  type IssueRef,
  LABELS,
  pushAccessChecker,
  type Repo,
  removeLabel,
} from "./github.ts";

export const MAX_LINES = 1000;

// Translations arrive from the community in bulk, and lockfiles are generated.
const UNCOUNTED = [/\/locales\//, /(^|\/)messages_[\w-]+\.properties$/, /(^|\/)package-lock\.json$/, /\.lock$/, /\.lockfile$/];

const PER_PAGE = 100;

// Identifies the check's own comment, so each PR gets one that is edited, not a new one per push.
const COMMENT_MARKER = "<!-- pr-size-limit -->";

export interface ChangedFile {
  filename: string;
  additions: number;
  deletions: number;
}

/** The parts of a github-script `context.payload.pull_request` the check reads. */
export interface SizedPullRequest {
  number: number;
  state: string;
  additions: number;
  deletions: number;
  user: { login: string; type: string };
  labels: { name: string }[];
}

/** The outcome for one PR. `held` is whether it should carry too-large. */
export interface SizeVerdict {
  held: boolean;
  summary: string;
}

/** Lines added plus lines removed, leaving out translations and lockfiles. */
export function countedLines(files: ChangedFile[]) {
  return files
    .filter((file) => !UNCOUNTED.some((pattern) => pattern.test(file.filename)))
    .reduce((total, file) => total + file.additions + file.deletions, 0);
}

/** Why the limit never applies to this author, or null. */
export async function authorExemption(pr: SizedPullRequest, canPush: CanPush): Promise<string | null> {
  if (pr.user.type === "Bot") return `${pr.user.login} is a bot`;
  return (await canPush(pr.user.login)) ? `${pr.user.login} is on the team` : null;
}

/** Why a maintainer has lifted the limit for this PR, or null. */
export function approval(pr: SizedPullRequest): string | null {
  return pr.labels.some((label) => label.name === LABELS.largePrApproved) ? `it is labelled \`${LABELS.largePrApproved}\`` : null;
}

export function oversizedComment(login: string, lines: number) {
  return [
    COMMENT_MARKER,
    `Hi @${login}, this PR has been marked as too large because it changes ${lines} lines, not counting translations and lockfiles. To keep reviews manageable, PRs from contributors outside the team are limited to ${MAX_LINES} lines.`,
    "",
    "Please split it into smaller PRs that can each be reviewed on their own. If you think it can't be split, just add a comment explaining why so a maintainer can take a look.",
    "",
    `If this is still outstanding in ${CLOSE_AFTER_WARNING_DAYS} days, the PR will be closed automatically.`,
  ].join("\n");
}

const LIFTED = `${COMMENT_MARKER}\nThis PR is no longer marked as too large`;

export const liftedComment = (reason: string) => `${LIFTED}, because ${reason}.`;

async function allPages<T>(fetchPage: (page: number) => Promise<{ data: T[] }>) {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const { data } = await fetchPage(page);
    items.push(...data);
    if (data.length < PER_PAGE) return items;
  }
}

async function findOwnComment(github: GitHubClient, issue: IssueRef) {
  const comments = await allPages((page) => github.rest.issues.listComments({ ...issue, per_page: PER_PAGE, page }));
  return comments.find((comment) => comment.user?.type === "Bot" && comment.body?.startsWith(COMMENT_MARKER)) ?? null;
}

async function countLines(github: GitHubClient, repo: Repo, pr: SizedPullRequest) {
  const total = pr.additions + pr.deletions;
  // Counting only leaves lines out, so a PR within the limit in total needs no file list.
  if (total <= MAX_LINES) return total;
  // The files endpoint stops at 3000 files, far past the limit anyway.
  return countedLines(await allPages((page) => github.rest.pulls.listFiles({ ...repo, pull_number: pr.number, per_page: PER_PAGE, page })));
}

async function warn(github: GitHubClient, issue: IssueRef, pr: SizedPullRequest, lines: number, labelled: boolean) {
  const body = oversizedComment(pr.user.login, lines);
  const existing = await findOwnComment(github, issue);
  if (existing === null) await github.rest.issues.createComment({ ...issue, body });
  else if (existing.body !== body) await github.rest.issues.updateComment({ owner: issue.owner, repo: issue.repo, comment_id: existing.id, body });
  if (!labelled) await github.rest.issues.addLabels({ ...issue, labels: [LABELS.tooLarge] });
}

async function lift(github: GitHubClient, issue: IssueRef, reason: string) {
  const existing = await findOwnComment(github, issue);
  if (existing !== null && !existing.body?.startsWith(LIFTED)) {
    await github.rest.issues.updateComment({ owner: issue.owner, repo: issue.repo, comment_id: existing.id, body: liftedComment(reason) });
  }
  await removeLabel(github, issue, LABELS.tooLarge);
}

/**
 * Checks one open PR against the limit, and when `live`, warns or lifts the warning to
 * match: comments, and adds or removes too-large. Changes nothing unless `live`.
 */
export async function enforceSizeLimit(
  github: GitHubClient,
  repo: Repo,
  pr: SizedPullRequest,
  live: boolean,
  canPush: CanPush,
): Promise<SizeVerdict> {
  const issue = { ...repo, issue_number: pr.number };
  const labelled = pr.labels.some((label) => label.name === LABELS.tooLarge);
  const total = pr.additions + pr.deletions;
  if (!labelled && total <= MAX_LINES) return { held: false, summary: `Within the size limit: it changes ${total} lines.` };

  // Only a PR that was told it is too large hears that it no longer is.
  const release = async (reason: string): Promise<SizeVerdict> => {
    if (live && labelled) await lift(github, issue, reason);
    return { held: false, summary: `Within the size limit: ${reason}.` };
  };
  const exempt = (await authorExemption(pr, canPush)) ?? approval(pr);
  if (exempt !== null) return release(exempt);
  const lines = await countLines(github, repo, pr);
  if (lines <= MAX_LINES) return release(`it now changes ${lines} lines`);

  if (live) await warn(github, issue, pr, lines, labelled);
  return {
    held: true,
    summary: `This PR changes ${lines} lines, not counting translations and lockfiles, over the ${MAX_LINES}-line limit for contributors outside the team. Please split it into smaller PRs, or add a comment explaining why it can't be split.`,
  };
}

/**
 * pr-size-limit.yml's entry point: fails the check while the PR is over the limit. Until
 * `live`, it only warns, so the check can run before the limit is enforced.
 */
export async function checkPullRequestSize({
  github,
  context,
  core,
  live,
}: {
  github: GitHubClient;
  context: { repo: Repo; payload: { pull_request: SizedPullRequest } };
  core: Pick<Core, "info" | "warning" | "setFailed">;
  live: boolean;
}) {
  const pr = context.payload.pull_request;
  if (pr.state !== "open") {
    core.info("The PR is closed.");
    return;
  }
  const verdict = await enforceSizeLimit(github, context.repo, pr, live, pushAccessChecker(github, context.repo));
  if (!verdict.held) core.info(verdict.summary);
  else if (live) core.setFailed(verdict.summary);
  else core.warning(`Not enforced yet: ${verdict.summary}`);
}
