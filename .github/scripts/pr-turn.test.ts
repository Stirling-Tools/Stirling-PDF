import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GitHubClient, LABELS } from "./github.ts";
import { answeredPull, type ReviewNode, syncTurnLabel, type TimelineItem, type TurnPayload, updateTurnLabel } from "./pr-turn.ts";

type TurnItem = ReviewNode | TimelineItem;

const AUTHOR = "contributor";
const HEAD = "head-sha";
const NOW = Date.parse("2026-10-01T12:00:00Z");
const repo = { owner: "o", repo: "r" };
const issue = { ...repo, issue_number: 7 };

interface FakeOptions {
  alreadyRemoved?: boolean;
  pageSize?: number;
}

function fakeGitHub(items: TurnItem[] = [], { alreadyRemoved = false, pageSize = 100 }: FakeOptions = {}) {
  const calls: string[] = [];
  const reads = { pages: 0 };
  const github: GitHubClient = {
    graphql: async <T>(query: string, variables: Record<string, unknown>) => {
      reads.pages += 1;
      if (query.includes("reviews(last")) {
        const reviews = { nodes: items.filter((item) => item.__typename === "PullRequestReview") };
        return { repository: { pullRequest: { author: { login: AUTHOR }, headRefOid: HEAD, reviews } } } as T;
      }
      const timeline = items.filter((item) => item.__typename !== "PullRequestReview");
      const end = typeof variables.before === "string" ? Number(variables.before) : timeline.length;
      const start = Math.max(0, end - pageSize);
      const timelineItems = { pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) }, nodes: timeline.slice(start, end) };
      return { repository: { pullRequest: { timelineItems } } } as T;
    },
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => assert.fail("no permission lookups"),
      },
      issues: {
        createComment: async () => assert.fail("no comments"),
        addLabels: async ({ issue_number, labels }) => calls.push(`label #${issue_number} ${labels.join(",")}`),
        removeLabel: async ({ issue_number, name }) => {
          if (alreadyRemoved) throw Object.assign(new Error("Label does not exist"), { status: 404 });
          return calls.push(`unlabel #${issue_number} ${name}`);
        },
        listComments: async () => assert.fail("no comment reads"),
        updateComment: async () => assert.fail("no comment edits"),
      },
      pulls: {
        get: async () => assert.fail("no PR reads"),
        update: async () => assert.fail("no closes"),
        listFiles: async () => assert.fail("no file lists"),
      },
    },
  };
  return { github, calls, reads };
}

const minutesAgo = (n: number) => new Date(NOW - n * 60 * 1000).toISOString();

const review = (state: string, login: string, canPush: boolean, ago: number, commit = HEAD, type = "User"): TurnItem => ({
  __typename: "PullRequestReview",
  submittedAt: minutesAgo(ago),
  state,
  authorCanPushToRepository: canPush,
  author: { login, __typename: type },
  commit: { oid: commit },
});
const comment = (login: string, ago: number): TurnItem => ({ __typename: "IssueComment", createdAt: minutesAgo(ago), author: { login } });
const dismissal = (ago: number): TurnItem => ({
  __typename: "ReviewDismissedEvent",
  createdAt: minutesAgo(ago),
  previousReviewState: "CHANGES_REQUESTED",
});
const labelEvent = (typename: "LabeledEvent" | "UnlabeledEvent", ago: number, name = LABELS.waitingOnAuthor): TurnItem => ({
  __typename: typename,
  createdAt: minutesAgo(ago),
  label: { name },
});

const pushBy = (login: string): TurnPayload => ({ sender: { login }, pull_request: { number: 7, user: { login: AUTHOR } } });
const commentBy = (login: string, onPullRequest = true): TurnPayload => ({
  issue: { number: 7, user: { login: AUTHOR }, ...(onPullRequest ? { pull_request: {} } : {}) },
  comment: { user: { login } },
});

async function sync(items: TurnItem[], { labelled = false, live = true } = {}) {
  const { github, calls } = fakeGitHub(items);
  return { waiting: await syncTurnLabel(github, issue, labelled, live), calls };
}

const ADDED = ["label #7 waiting-on-author"];
const REMOVED = ["unlabel #7 waiting-on-author"];

describe("answered pull", () => {
  it("hands the turn back when the author pushes, re-requests review or marks it ready", () => {
    assert.equal(answeredPull(pushBy(AUTHOR)), 7);
  });

  it("ignores a maintainer's push, such as Update branch", () => {
    assert.equal(answeredPull(pushBy("maintainer")), null);
  });

  it("hands the turn back when the author comments", () => {
    assert.equal(answeredPull(commentBy(AUTHOR)), 7);
  });

  it("ignores someone else's comment, and comments on issues", () => {
    assert.equal(answeredPull(commentBy("maintainer")), null);
    assert.equal(answeredPull(commentBy(AUTHOR, false)), null);
  });
});

describe("update turn label", () => {
  const core = { info: () => {} };

  it("removes the label, and does not mind when it is not there", async () => {
    const present = fakeGitHub();
    await updateTurnLabel({ github: present.github, context: { repo, payload: pushBy(AUTHOR) }, core });
    assert.deepEqual(present.calls, REMOVED);

    const absent = fakeGitHub([], { alreadyRemoved: true });
    await updateTurnLabel({ github: absent.github, context: { repo, payload: pushBy(AUTHOR) }, core });
    assert.deepEqual(absent.calls, []);
  });

  it("leaves the label for an event that is not the author's", async () => {
    const { github, calls } = fakeGitHub();
    await updateTurnLabel({ github, context: { repo, payload: commentBy("maintainer") }, core });
    assert.deepEqual(calls, []);
  });
});

describe("sync turn label", () => {
  it("gives the author the turn on a changes-requested review from someone who can push", async () => {
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "maintainer", true, 1)]), { waiting: true, calls: ADDED });
  });

  it("ignores changes requested by someone who cannot push, or by a bot", async () => {
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "passer-by", false, 1)]), { waiting: false, calls: [] });
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "review-bot", true, 1, HEAD, "Bot")]), { waiting: false, calls: [] });
  });

  it("hands the turn back on an approval from someone who can push", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), review("APPROVED", "maintainer", true, 1)];
    assert.deepEqual(await sync(items, { labelled: true }), { waiting: false, calls: REMOVED });
  });

  it("ignores approvals from someone who cannot push, and comment-only reviews", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9)];
    const stillWaiting = { waiting: true, calls: [] };
    assert.deepEqual(await sync([...items, review("APPROVED", "passer-by", false, 1)], { labelled: true }), stillWaiting);
    assert.deepEqual(await sync([...items, review("COMMENTED", "maintainer", true, 1)], { labelled: true }), stillWaiting);
  });

  it("hands the turn back when the author replies in a review or a review thread", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), review("COMMENTED", AUTHOR, false, 1)];
    assert.deepEqual(await sync(items, { labelled: true }), { waiting: false, calls: REMOVED });
  });

  it("hands the turn back when a changes-requested review is dismissed", async () => {
    const items = [review("DISMISSED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), dismissal(1)];
    assert.deepEqual(await sync(items, { labelled: true }), { waiting: false, calls: REMOVED });
  });

  it("goes by the latest review", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 2), review("APPROVED", "other-maintainer", true, 1)];
    assert.deepEqual(await sync(items), { waiting: false, calls: [] });
  });

  it("does not add the label when the author answered before the triage ran", async () => {
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "maintainer", true, 2, "older-sha")]), { waiting: false, calls: [] });
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "maintainer", true, 2), comment(AUTHOR, 1)]), { waiting: false, calls: [] });
  });

  it("keeps a label added by hand", async () => {
    const items = [review("APPROVED", "maintainer", true, 10), labelEvent("LabeledEvent", 1)];
    assert.deepEqual(await sync(items, { labelled: true }), { waiting: true, calls: [] });
  });

  it("does not re-add a label removed by hand", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), labelEvent("UnlabeledEvent", 1)];
    assert.deepEqual(await sync(items), { waiting: false, calls: [] });
  });

  it("reads further back in the timeline when the newest page moves nothing", async () => {
    const noise = Array.from({ length: 5 }, (_, index) => comment("maintainer", 5 - index));
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), comment(AUTHOR, 8), ...noise];
    const { github, reads } = fakeGitHub(items, { pageSize: 2 });
    assert.equal(await syncTurnLabel(github, issue, false, true), false);
    assert.ok(reads.pages > 2);
  });

  it("reads no timeline for an unlabelled PR no review hands to the author", async () => {
    const { github, reads } = fakeGitHub([review("APPROVED", "maintainer", true, 2), comment(AUTHOR, 1)]);
    assert.equal(await syncTurnLabel(github, issue, false, true), false);
    assert.equal(reads.pages, 1);
  });

  it("changes nothing in a dry run", async () => {
    assert.deepEqual(await sync([review("CHANGES_REQUESTED", "maintainer", true, 1)], { live: false }), { waiting: true, calls: [] });
    assert.deepEqual(await sync([], { labelled: true, live: false }), { waiting: false, calls: [] });
  });
});
