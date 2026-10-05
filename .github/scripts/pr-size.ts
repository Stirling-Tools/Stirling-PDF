// Fails a PR from someone outside the team whose diff is over MAX_LINES, run by
// .github/workflows/pr-size-limit.yml. Members, collaborators, bots, the logins in
// .github/config/pr-size-allowlist.json and PRs labelled large-pr-approved are exempt.

import { readFile } from "node:fs/promises";

import { type Core, type GitHubClient, LABELS, type Repo } from "./github.ts";

export const MAX_LINES = 1000;

const ALLOWLIST = new URL("../config/pr-size-allowlist.json", import.meta.url);

const TEAM_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"];

// Translations arrive from the community in bulk, and lockfiles are generated.
const UNCOUNTED = [/\/locales\//, /(^|\/)messages_[\w-]+\.properties$/, /(^|\/)package-lock\.json$/, /\.lock$/, /\.lockfile$/];

const FILES_PER_PAGE = 100;

export interface ChangedFile {
  filename: string;
  additions: number;
  deletions: number;
}

/** The parts of a github-script `context.payload.pull_request` the check reads. */
export interface SizedPullRequest {
  number: number;
  additions: number;
  deletions: number;
  author_association: string;
  user: { login: string; type: string };
  labels: { name: string }[];
}

/** Lines added plus lines removed, leaving out translations and lockfiles. */
export function countedLines(files: ChangedFile[]) {
  return files
    .filter((file) => !UNCOUNTED.some((pattern) => pattern.test(file.filename)))
    .reduce((total, file) => total + file.additions + file.deletions, 0);
}

/** Why the PR is exempt from the limit, or null when it is not. `allowlist` is lowercase logins. */
export function exemption(pr: SizedPullRequest, allowlist: string[]): string | null {
  if (TEAM_ASSOCIATIONS.includes(pr.author_association)) return `${pr.user.login} is on the team`;
  if (pr.user.type === "Bot") return `${pr.user.login} is a bot`;
  if (allowlist.includes(pr.user.login.toLowerCase())) return `${pr.user.login} is on the allowlist`;
  if (pr.labels.some((label) => label.name === LABELS.largePrApproved)) return `it is labelled ${LABELS.largePrApproved}`;
  return null;
}

export async function readAllowlist() {
  const logins: string[] = JSON.parse(await readFile(ALLOWLIST, "utf8"));
  return logins.map((login) => login.toLowerCase());
}

// The files endpoint caps a PR at 3000 files, which is far past the limit anyway.
async function listFiles(github: GitHubClient, repo: Repo, number: number) {
  const files: ChangedFile[] = [];
  for (let page = 1; ; page += 1) {
    const { data } = await github.rest.pulls.listFiles({ ...repo, pull_number: number, per_page: FILES_PER_PAGE, page });
    files.push(...data);
    if (data.length < FILES_PER_PAGE) return files;
  }
}

export async function checkPullRequestSize({
  github,
  context,
  core,
  allowlist,
}: {
  github: GitHubClient;
  context: { repo: Repo; payload: { pull_request: SizedPullRequest } };
  core: Pick<Core, "info" | "setFailed">;
  allowlist: string[];
}) {
  const pr = context.payload.pull_request;
  const exempt = exemption(pr, allowlist);
  if (exempt !== null) {
    core.info(`No size limit: ${exempt}.`);
    return;
  }
  // Counting only leaves lines out, so a PR within the limit in total needs no file list.
  const lines = pr.additions + pr.deletions <= MAX_LINES ? pr.additions + pr.deletions : countedLines(await listFiles(github, context.repo, pr.number));
  if (lines <= MAX_LINES) {
    core.info(`${lines} lines changed, within the ${MAX_LINES}-line limit.`);
    return;
  }
  core.setFailed(
    `This PR changes ${lines} lines, not counting translations and lockfiles. PRs from contributors outside the team are limited to ${MAX_LINES} lines so they can be reviewed properly. Please split it into smaller PRs, or if it cannot be split, ask a maintainer to add the ${LABELS.largePrApproved} label.`,
  );
}
