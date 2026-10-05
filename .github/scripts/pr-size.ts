// Holds a PR from someone outside the team to MAX_LINES. pr-size-limit.yml runs it as
// the PR changes, and the daily triage runs it on every open PR, then closes one that
// has been too-large for CLOSE_AFTER_WARNING_DAYS. An oversized PR fails the check, is
// labelled too-large and gets one comment saying why, kept up to date as the PR changes;
// the label's age is the warning's. Members, collaborators, bots, the logins in
// .github/config/pr-size-allowlist.json and PRs labelled large-pr-approved are exempt.
// This file owns too-large and no other label.

import { readFile } from "node:fs/promises";

import { CLOSE_AFTER_WARNING_DAYS, type Core, type GitHubClient, type IssueRef, LABELS, type Repo, removeLabel } from "./github.ts";

export const MAX_LINES = 1000;

const ALLOWLIST = new URL("../config/pr-size-allowlist.json", import.meta.url);

const TEAM_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"];

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
  author_association: string;
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
export function authorExemption(pr: SizedPullRequest): string | null {
  if (TEAM_ASSOCIATIONS.includes(pr.author_association)) return `${pr.user.login} is on the team`;
  return pr.user.type === "Bot" ? `${pr.user.login} is a bot` : null;
}

/** Why a maintainer has lifted the limit for this PR, or null. `allowlist` is lowercase logins. */
export function approval(pr: SizedPullRequest, allowlist: string[]): string | null {
  if (allowlist.includes(pr.user.login.toLowerCase())) return `${pr.user.login} is on the size allowlist`;
  return pr.labels.some((label) => label.name === LABELS.largePrApproved) ? `it is labelled \`${LABELS.largePrApproved}\`` : null;
}

export async function readAllowlist() {
  const logins: string[] = JSON.parse(await readFile(ALLOWLIST, "utf8"));
  return logins.map((login) => login.toLowerCase());
}

export function oversizedComment(login: string, lines: number) {
  return [
    COMMENT_MARKER,
    `Hi @${login}, this PR changes ${lines} lines, not counting translations and lockfiles. PRs from contributors outside the team are limited to ${MAX_LINES} lines so that they can be reviewed properly, and this one can't be merged until it is within the limit.`,
    "",
    `Please split it into smaller PRs that can each be reviewed on their own. If it really can't be split, say why here and a maintainer can add the \`${LABELS.largePrApproved}\` label.`,
    "",
    `If it is still over the limit in ${CLOSE_AFTER_WARNING_DAYS} days, it will be closed automatically.`,
  ].join("\n");
}

const LIFTED = `${COMMENT_MARKER}\nThe size limit no longer holds this PR back`;

export const liftedComment = (reason: string) => `${LIFTED}: ${reason}.`;

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
export async function enforceSizeLimit(github: GitHubClient, repo: Repo, pr: SizedPullRequest, allowlist: string[], live: boolean): Promise<SizeVerdict> {
  const issue = { ...repo, issue_number: pr.number };
  const labelled = pr.labels.some((label) => label.name === LABELS.tooLarge);
  const exempt = authorExemption(pr);
  if (exempt !== null) {
    if (live && labelled) await removeLabel(github, issue, LABELS.tooLarge);
    return { held: false, summary: `No size limit: ${exempt}.` };
  }

  const lines = await countLines(github, repo, pr);
  const reason = approval(pr, allowlist) ?? (lines <= MAX_LINES ? `it now changes ${lines} lines` : null);
  if (reason === null) {
    if (live) await warn(github, issue, pr, lines, labelled);
    return {
      held: true,
      summary: `This PR changes ${lines} lines, not counting translations and lockfiles, over the ${MAX_LINES}-line limit for contributors outside the team. Split it into smaller PRs, or ask a maintainer to add the ${LABELS.largePrApproved} label.`,
    };
  }
  // Only a PR that was told it is too large hears that it no longer is.
  if (live && labelled) await lift(github, issue, reason);
  return { held: false, summary: `Within the size limit: ${reason}.` };
}

/** pr-size-limit.yml's entry point: fails the check while the PR is over the limit. */
export async function checkPullRequestSize({
  github,
  context,
  core,
  allowlist,
  live,
}: {
  github: GitHubClient;
  context: { repo: Repo; payload: { pull_request: SizedPullRequest } };
  core: Pick<Core, "info" | "setFailed">;
  allowlist: string[];
  live: boolean;
}) {
  const pr = context.payload.pull_request;
  if (pr.state !== "open") {
    core.info("The PR is closed.");
    return;
  }
  const verdict = await enforceSizeLimit(github, context.repo, pr, allowlist, live);
  if (verdict.held) core.setFailed(verdict.summary);
  else core.info(verdict.summary);
}
