import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { turnChangeForEvent, type TurnPayload, updateTurnLabel } from "./pr-turn.ts";
import type { GitHubClient } from "./stale-prs.ts";

const AUTHOR = "contributor";
const repo = { owner: "o", repo: "r" };

interface Review {
  databaseId: number;
  state: string;
  authorCanPushToRepository: boolean;
  author: { login: string } | null;
}

function fakeGitHub(reviews: Review[] = [], { alreadyRemoved = false } = {}) {
  const calls: string[] = [];
  const github: GitHubClient = {
    graphql: async <T>() =>
      ({ repository: { pullRequest: { author: { login: AUTHOR }, reviews: { nodes: reviews } } } }) as T,
    rest: {
      issues: {
        createComment: async () => assert.fail("no comments"),
        addLabels: async ({ issue_number, labels }) => calls.push(`label #${issue_number} ${labels.join(",")}`),
        removeLabel: async ({ issue_number, name }) => {
          if (alreadyRemoved) throw Object.assign(new Error("Label does not exist"), { status: 404 });
          return calls.push(`unlabel #${issue_number} ${name}`);
        },
      },
      pulls: {
        get: async () => assert.fail("no reads"),
        update: async () => assert.fail("no closes"),
      },
    },
  };
  return { github, calls };
}

const changeFor = (payload: TurnPayload, reviews: Review[] = []) =>
  turnChangeForEvent(fakeGitHub(reviews).github, { repo, payload });

const pushBy = (login: string): TurnPayload => ({ sender: { login }, pull_request: { number: 7, user: { login: AUTHOR } } });
const commentBy = (login: string, onPullRequest = true): TurnPayload => ({
  issue: { number: 7, user: { login: AUTHOR }, ...(onPullRequest ? { pull_request: {} } : {}) },
  comment: { user: { login } },
});
const reviewRun = (reviewId: number): TurnPayload => ({ workflow_run: { display_title: `Review ${reviewId} on #7` } });
const review = (state: string, login: string, canPush: boolean): Review => ({
  databaseId: 99,
  state,
  authorCanPushToRepository: canPush,
  author: { login },
});

describe("turn change for an event", () => {
  it("hands the turn back when the author pushes, re-requests review or marks it ready", async () => {
    assert.deepEqual(await changeFor(pushBy(AUTHOR)), { number: 7, add: false });
  });

  it("ignores a maintainer's push, such as Update branch", async () => {
    assert.equal(await changeFor(pushBy("maintainer")), null);
  });

  it("hands the turn back when the author comments", async () => {
    assert.deepEqual(await changeFor(commentBy(AUTHOR)), { number: 7, add: false });
  });

  it("ignores someone else's comment, and comments on issues", async () => {
    assert.equal(await changeFor(commentBy("maintainer")), null);
    assert.equal(await changeFor(commentBy(AUTHOR, false)), null);
  });

  it("gives the author the turn on a changes-requested review from someone who can push", async () => {
    assert.deepEqual(await changeFor(reviewRun(99), [review("CHANGES_REQUESTED", "maintainer", true)]), {
      number: 7,
      add: true,
    });
  });

  it("ignores changes requested by someone who cannot push", async () => {
    assert.equal(await changeFor(reviewRun(99), [review("CHANGES_REQUESTED", "passer-by", false)]), null);
  });

  it("ignores approvals and comment-only reviews from maintainers", async () => {
    assert.equal(await changeFor(reviewRun(99), [review("APPROVED", "maintainer", true)]), null);
    assert.equal(await changeFor(reviewRun(99), [review("COMMENTED", "maintainer", true)]), null);
  });

  it("hands the turn back when the author replies in a review", async () => {
    assert.deepEqual(await changeFor(reviewRun(99), [review("COMMENTED", AUTHOR, false)]), { number: 7, add: false });
  });

  it("ignores a review it cannot find, and runs it did not relay", async () => {
    assert.equal(await changeFor(reviewRun(98), [review("CHANGES_REQUESTED", "maintainer", true)]), null);
    assert.equal(await changeFor({ workflow_run: { display_title: "Something else" } }), null);
  });
});

describe("update turn label", () => {
  const core = { info: () => {} };

  it("adds the label", async () => {
    const { github, calls } = fakeGitHub([review("CHANGES_REQUESTED", "maintainer", true)]);
    await updateTurnLabel({ github, context: { repo, payload: reviewRun(99) }, core });
    assert.deepEqual(calls, ["label #7 waiting-on-author"]);
  });

  it("removes the label, and does not mind when it is not there", async () => {
    const present = fakeGitHub();
    await updateTurnLabel({ github: present.github, context: { repo, payload: pushBy(AUTHOR) }, core });
    assert.deepEqual(present.calls, ["unlabel #7 waiting-on-author"]);

    const absent = fakeGitHub([], { alreadyRemoved: true });
    await updateTurnLabel({ github: absent.github, context: { repo, payload: pushBy(AUTHOR) }, core });
    assert.deepEqual(absent.calls, []);
  });
});
