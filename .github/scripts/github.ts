// The GitHub API surface and labels the PR bots share.

export const LABELS = {
  stale: "Stale PR",
  onHold: "on-hold",
  backlogCleanup: "backlog-cleanup",
  waitingOnAuthor: "waiting-on-author",
  conflicts: "has conflicts", // must match CONFLICT_LABEL in pr-conflict-labeler.yml
};

/** The login github.token acts as, so the actor on every write these bots make. */
export const BOT_LOGIN = "github-actions";

export interface Repo {
  owner: string;
  repo: string;
}

export type IssueRef = Repo & { issue_number: number };

export interface PullData {
  mergeable: boolean | null;
  mergeable_state: string;
  labels: { name: string }[];
  head: { ref: string; repo: { full_name: string } | null };
}

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
      get(params: Repo & { pull_number: number }): Promise<{ data: PullData }>;
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

export const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/** Removes a label, treating one that is already gone as removed. */
export async function removeLabel(github: GitHubClient, issue: IssueRef, name: string) {
  await github.rest.issues.removeLabel({ ...issue, name }).catch((error: unknown) => {
    if (!isNotFound(error)) throw error;
  });
}
