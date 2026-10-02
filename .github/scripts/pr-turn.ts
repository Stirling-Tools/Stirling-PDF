// Keeps waiting-on-author current. pr-turn-labels.yml runs it as each event happens, and
// the daily triage re-checks every ready PR that has the label, because the review relay
// does not always run: a conflicted PR has no merge ref to run it on. This file owns
// waiting-on-author and no other label.
//
// The author's turn starts with a changes-requested review from someone who can push, or
// the label added by hand. It ends when the author pushes, comments, replies to a review,
// re-requests review or marks the PR ready, when someone who can push approves, when a
// changes-requested review is dismissed, or when the label is removed.

import { type Core, type GitHubClient, type IssueRef, isNotFound, LABELS, type PullData, type Repo, removeLabel } from "./github.ts";

/** The parts of a github-script `context.payload` the turn events carry. */
export interface TurnPayload {
  sender?: { login: string };
  pull_request?: { number: number; user: { login: string } };
  issue?: { number: number; user: { login: string }; pull_request?: unknown };
  comment?: { user: { login: string } };
  workflow_run?: { event: string; display_title: string; head_branch: string; head_repository: { full_name: string } };
}

export interface TurnChange {
  number: number;
  add: boolean;
}

// Must match the run-name in pr-review-events.yml.
const REVIEW_RUN_TITLE = /^Review on #(\d+)$/;

const TURN_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        author { login }
        headRefOid
        timelineItems(
          last: 100
          before: $before
          itemTypes: [PULL_REQUEST_REVIEW, ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, READY_FOR_REVIEW_EVENT, REVIEW_DISMISSED_EVENT, LABELED_EVENT, UNLABELED_EVENT]
        ) {
          pageInfo { hasPreviousPage startCursor }
          nodes {
            __typename
            ... on PullRequestReview { submittedAt state authorCanPushToRepository author { login __typename } commit { oid } }
            ... on IssueComment { createdAt author { login } }
            ... on ReviewRequestedEvent { createdAt actor { login } }
            ... on ReadyForReviewEvent { createdAt actor { login } }
            ... on ReviewDismissedEvent { createdAt previousReviewState }
            ... on LabeledEvent { createdAt label { name } }
            ... on UnlabeledEvent { createdAt label { name } }
          }
        }
      }
    }
  }
`;

type Login = { login: string } | null;

/** One timeline item as TURN_QUERY returns it: must stay in sync with the query. */
export type TurnItem =
  | {
      __typename: "PullRequestReview";
      submittedAt: string | null;
      state: string;
      authorCanPushToRepository: boolean;
      author: { login: string; __typename: string } | null;
      commit: { oid: string } | null;
    }
  | { __typename: "IssueComment"; createdAt: string; author: Login }
  | { __typename: "ReviewRequestedEvent" | "ReadyForReviewEvent"; createdAt: string; actor: Login }
  | { __typename: "ReviewDismissedEvent"; createdAt: string; previousReviewState: string }
  | { __typename: "LabeledEvent" | "UnlabeledEvent"; createdAt: string; label: { name: string } };

export interface TurnPage {
  repository: {
    pullRequest: {
      author: Login;
      headRefOid: string;
      timelineItems: {
        pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
        nodes: TurnItem[];
      };
    } | null;
  };
}

type Turn = "author" | "maintainers";

function turnAfter(item: TurnItem, author: string | undefined, headOid: string): Turn | null {
  const isAuthor = (actor: Login) => actor !== null && actor.login === author;
  switch (item.__typename) {
    case "PullRequestReview":
      if (isAuthor(item.author)) return "maintainers";
      // Review bots can have push access, but only a person's verdict moves the turn.
      if (item.author?.__typename === "Bot" || !item.authorCanPushToRepository) return null;
      if (item.state === "APPROVED") return "maintainers";
      // A push has no time to compare against, so one since the review shows as the
      // review being of an older commit.
      return item.state === "CHANGES_REQUESTED" && item.commit?.oid === headOid ? "author" : null;
    case "IssueComment":
      return isAuthor(item.author) ? "maintainers" : null;
    case "ReviewRequestedEvent":
    case "ReadyForReviewEvent":
      return isAuthor(item.actor) ? "maintainers" : null;
    case "ReviewDismissedEvent":
      return item.previousReviewState === "CHANGES_REQUESTED" ? "maintainers" : null;
    case "LabeledEvent":
    case "UnlabeledEvent":
      if (item.label.name !== LABELS.waitingOnAuthor) return null;
      return item.__typename === "LabeledEvent" ? "author" : "maintainers";
  }
}

const itemTime = (item: TurnItem) => (item.__typename === "PullRequestReview" ? item.submittedAt : item.createdAt);

/**
 * Whether the PR is waiting on its author. Read from the PR's history rather than the
 * event at hand, so runs that overlap, arrive late or are re-run all agree.
 */
export async function authorHasTurn(github: GitHubClient, { owner, repo }: Repo, number: number): Promise<boolean> {
  let before: string | null = null;
  do {
    const page: TurnPage = await github.graphql(TURN_QUERY, { owner, repo, number, before });
    const pr = page.repository.pullRequest;
    if (pr === null) return false;
    const moves = pr.timelineItems.nodes.flatMap((item) => {
      const at = itemTime(item);
      const turn = turnAfter(item, pr.author?.login, pr.headRefOid);
      return at === null || turn === null ? [] : [{ at: Date.parse(at), turn }];
    });
    if (moves.length > 0) return moves.reduce((latest, move) => (move.at >= latest.at ? move : latest)).turn === "author";
    const { hasPreviousPage, startCursor } = pr.timelineItems.pageInfo;
    before = hasPreviousPage ? startCursor : null;
  } while (before !== null);
  return false;
}

async function relayedPull(github: GitHubClient, repo: Repo, run: NonNullable<TurnPayload["workflow_run"]>) {
  const match = REVIEW_RUN_TITLE.exec(run.display_title);
  if (run.event !== "pull_request_review" || !match) return null;
  const number = Number(match[1]);
  const pull = await github.rest.pulls.get({ ...repo, pull_number: number }).then(
    ({ data }): PullData | null => data,
    (error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    },
  );
  // Any PR can name a run, by editing pr-review-events.yml or adding a workflow of the
  // same name, so the title is only trusted for the PR the run was built from.
  const builtFrom = pull?.head.repo?.full_name === run.head_repository.full_name && pull.head.ref === run.head_branch;
  return builtFrom ? { number, pull } : null;
}

/** How the triggering event moves waiting-on-author, or null when it does not. */
export async function turnChangeForEvent(
  github: GitHubClient,
  { repo, payload }: { repo: Repo; payload: TurnPayload },
): Promise<TurnChange | null> {
  if (payload.pull_request) {
    const { number, user } = payload.pull_request;
    return payload.sender?.login === user.login ? { number, add: false } : null;
  }
  if (payload.issue) {
    const { number, user, pull_request } = payload.issue;
    return pull_request && payload.comment?.user.login === user.login ? { number, add: false } : null;
  }
  const relayed = payload.workflow_run ? await relayedPull(github, repo, payload.workflow_run) : null;
  if (relayed === null) return null;
  const add = await authorHasTurn(github, repo, relayed.number);
  const labelled = relayed.pull.labels.some((label) => label.name === LABELS.waitingOnAuthor);
  return add === labelled ? null : { number: relayed.number, add };
}

export async function updateTurnLabel({
  github,
  context,
  core,
}: {
  github: GitHubClient;
  context: { repo: Repo; payload: TurnPayload };
  core: Pick<Core, "info">;
}) {
  const change = await turnChangeForEvent(github, context);
  if (change === null) return;
  const issue = { ...context.repo, issue_number: change.number };
  if (change.add) {
    await github.rest.issues.addLabels({ ...issue, labels: [LABELS.waitingOnAuthor] });
  } else {
    await removeLabel(github, issue, LABELS.waitingOnAuthor);
  }
  core.info(`#${change.number}: ${change.add ? "+" : "-"}${LABELS.waitingOnAuthor}`);
}

/**
 * Removes waiting-on-author from a PR whose history says the turn has moved on. Returns
 * whether the label was stale; changes nothing unless `live`.
 */
export async function clearStaleTurnLabel(github: GitHubClient, issue: IssueRef, live: boolean) {
  if (await authorHasTurn(github, issue, issue.issue_number)) return false;
  if (live) await removeLabel(github, issue, LABELS.waitingOnAuthor);
  return true;
}
