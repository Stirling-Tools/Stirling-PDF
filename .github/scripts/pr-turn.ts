// Keeps waiting-on-author current, run by .github/workflows/pr-turn-labels.yml at the
// moment each event happens. A changes-requested review from someone who can push adds
// it. An approval from someone who can push removes it, as does the PR author pushing,
// commenting, replying to a review, re-requesting review or marking the PR ready. This
// file owns waiting-on-author and no other label.

import { type Core, type GitHubClient, LABELS, type Repo, removeLabel } from "./stale-prs.ts";

/** The parts of a github-script `context.payload` the turn events carry. */
export interface TurnPayload {
  sender?: { login: string };
  pull_request?: { number: number; user: { login: string } };
  issue?: { number: number; user: { login: string }; pull_request?: unknown };
  comment?: { user: { login: string } };
  workflow_run?: { display_title: string };
}

export interface TurnChange {
  number: number;
  add: boolean;
}

// Must match the run-name in pr-review-events.yml.
const REVIEW_RUN_TITLE = /^Review (\d+) on #(\d+)$/;

const REVIEWS_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        author { login }
        reviews(last: 100) { nodes { databaseId state authorCanPushToRepository author { login } } }
      }
    }
  }
`;

interface ReviewsPage {
  repository: {
    pullRequest: {
      author: { login: string } | null;
      reviews: {
        nodes: {
          databaseId: number;
          state: string;
          authorCanPushToRepository: boolean;
          author: { login: string } | null;
        }[];
      };
    };
  };
}

async function reviewChange(github: GitHubClient, repo: Repo, number: number, reviewId: number) {
  const page = await github.graphql<ReviewsPage>(REVIEWS_QUERY, { ...repo, number });
  const pr = page.repository.pullRequest;
  const review = pr.reviews.nodes.find((candidate) => candidate.databaseId === reviewId);
  if (!review?.author) return null;
  if (review.author.login === pr.author?.login) return { number, add: false };
  if (!review.authorCanPushToRepository) return null;
  if (review.state === "CHANGES_REQUESTED") return { number, add: true };
  return review.state === "APPROVED" ? { number, add: false } : null;
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
  const match = payload.workflow_run ? REVIEW_RUN_TITLE.exec(payload.workflow_run.display_title) : null;
  return match ? reviewChange(github, repo, Number(match[2]), Number(match[1])) : null;
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
