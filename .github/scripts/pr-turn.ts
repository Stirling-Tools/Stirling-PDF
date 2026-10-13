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

// Must match the run-name and the events in pr-review-events.yml.
const REVIEW_RUN_TITLE = /^Review on #(\d+)$/;
const RELAYED_EVENTS = ["pull_request_review", "pull_request_review_comment"];

// Reviews come from `reviews`, not the timeline: a reply to a review thread is a review
// of its own, and the timeline leaves those out.
const REVIEWS_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        author { login }
        headRefOid
        reviews(last: 100) {
          nodes { __typename submittedAt state authorCanPushToRepository author { login __typename } commit { oid } }
        }
      }
    }
  }
`;

const TIMELINE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $before: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        timelineItems(
          last: 100
          before: $before
          itemTypes: [ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, READY_FOR_REVIEW_EVENT, REVIEW_DISMISSED_EVENT, LABELED_EVENT, UNLABELED_EVENT]
        ) {
          pageInfo { hasPreviousPage startCursor }
          nodes {
            __typename
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

/** One review as REVIEWS_QUERY returns it: must stay in sync with the query. */
export interface ReviewNode {
  __typename: "PullRequestReview";
  submittedAt: string | null;
  state: string;
  authorCanPushToRepository: boolean;
  author: { login: string; __typename: string } | null;
  commit: { oid: string } | null;
}

/** One timeline item as TIMELINE_QUERY returns it: must stay in sync with the query. */
export type TimelineItem =
  | { __typename: "IssueComment"; createdAt: string; author: Login }
  | { __typename: "ReviewRequestedEvent" | "ReadyForReviewEvent"; createdAt: string; actor: Login }
  | { __typename: "ReviewDismissedEvent"; createdAt: string; previousReviewState: string }
  | { __typename: "LabeledEvent" | "UnlabeledEvent"; createdAt: string; label: { name: string } };

export interface ReviewsPage {
  repository: {
    pullRequest: { author: Login; headRefOid: string; reviews: { nodes: ReviewNode[] } } | null;
  };
}

export interface TimelinePage {
  repository: {
    pullRequest: {
      timelineItems: {
        pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
        nodes: TimelineItem[];
      };
    } | null;
  };
}

type Turn = "author" | "maintainers";

interface TurnMove {
  at: number;
  turn: Turn;
}

const isBy = (actor: Login, author: string | undefined) => actor !== null && actor.login === author;

function reviewTurn(review: ReviewNode, author: string | undefined, headOid: string): Turn | null {
  if (isBy(review.author, author)) return "maintainers";
  // Review bots can have push access, but only a person's verdict moves the turn.
  if (review.author?.__typename === "Bot" || !review.authorCanPushToRepository) return null;
  if (review.state === "APPROVED") return "maintainers";
  // A push has no time to compare against, so one since the review shows as the review
  // being of an older commit.
  return review.state === "CHANGES_REQUESTED" && review.commit?.oid === headOid ? "author" : null;
}

function timelineTurn(item: TimelineItem, author: string | undefined): Turn | null {
  const isAuthor = (actor: Login) => isBy(actor, author);
  switch (item.__typename) {
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

const move = (at: string | null, turn: Turn | null): TurnMove[] => (at === null || turn === null ? [] : [{ at: Date.parse(at), turn }]);

const latestMove = (moves: TurnMove[]) =>
  moves.reduce<TurnMove | null>((latest, candidate) => (latest === null || candidate.at >= latest.at ? candidate : latest), null);

// Pages run newest first, so the first page with a move holds the latest one.
async function latestTimelineMove(github: GitHubClient, repo: Repo, number: number, author: string | undefined) {
  let before: string | null = null;
  do {
    const page: TimelinePage = await github.graphql(TIMELINE_QUERY, { ...repo, number, before });
    const items = page.repository.pullRequest?.timelineItems;
    if (!items) return null;
    const latest = latestMove(items.nodes.flatMap((item) => move(item.createdAt, timelineTurn(item, author))));
    if (latest !== null) return latest;
    before = items.pageInfo.hasPreviousPage ? items.pageInfo.startCursor : null;
  } while (before !== null);
  return null;
}

/**
 * Whether the PR is waiting on its author. Read from the PR's history rather than the
 * event at hand, so runs that overlap, arrive late or are re-run all agree.
 */
export async function authorHasTurn(github: GitHubClient, { owner, repo }: Repo, number: number): Promise<boolean> {
  const page = await github.graphql<ReviewsPage>(REVIEWS_QUERY, { owner, repo, number });
  const pr = page.repository.pullRequest;
  if (pr === null) return false;
  const author = pr.author?.login;
  const fromReviews = pr.reviews.nodes.flatMap((review) => move(review.submittedAt, reviewTurn(review, author, pr.headRefOid)));
  const fromTimeline = await latestTimelineMove(github, { owner, repo }, number, author);
  return latestMove(fromTimeline === null ? fromReviews : [...fromReviews, fromTimeline])?.turn === "author";
}

async function relayedPull(github: GitHubClient, repo: Repo, run: NonNullable<TurnPayload["workflow_run"]>) {
  const match = REVIEW_RUN_TITLE.exec(run.display_title);
  if (!RELAYED_EVENTS.includes(run.event) || !match) return null;
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
