import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GitHubClient, LABELS } from "./github.ts";
import { clearStaleTurnLabel, type TurnItem, turnChangeForEvent, type TurnPayload, updateTurnLabel } from "./pr-turn.ts";

const AUTHOR = "contributor";
const HEAD = "head-sha";
const FORK = "contributor/r";
const BRANCH = "feature";
const NOW = Date.parse("2026-10-01T12:00:00Z");
const repo = { owner: "o", repo: "r" };

interface FakeOptions {
  labelled?: boolean;
  alreadyRemoved?: boolean;
  missing?: boolean;
  pageSize?: number;
}

function fakeGitHub(items: TurnItem[] = [], { labelled = false, alreadyRemoved = false, missing = false, pageSize = 100 }: FakeOptions = {}) {
  const calls: string[] = [];
  const reads = { pages: 0 };
  const github: GitHubClient = {
    graphql: async <T>(_query: string, variables: Record<string, unknown>) => {
      reads.pages += 1;
      const end = typeof variables.before === "string" ? Number(variables.before) : items.length;
      const start = Math.max(0, end - pageSize);
      const timelineItems = { pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) }, nodes: items.slice(start, end) };
      return { repository: { pullRequest: { author: { login: AUTHOR }, headRefOid: HEAD, timelineItems } } } as T;
    },
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
        get: async () => {
          if (missing) throw Object.assign(new Error("Not Found"), { status: 404 });
          const labels = labelled ? [{ name: LABELS.waitingOnAuthor }] : [];
          return { data: { mergeable: null, mergeable_state: "unknown", labels, head: { ref: BRANCH, repo: { full_name: FORK } } } };
        },
        update: async () => assert.fail("no closes"),
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
const relayRun = ({ title = "Review on #7", event = "pull_request_review", headRepo = FORK, headBranch = BRANCH } = {}): TurnPayload => ({
  workflow_run: { event, display_title: title, head_branch: headBranch, head_repository: { full_name: headRepo } },
});

const changeFor = (payload: TurnPayload, items: TurnItem[] = [], options: FakeOptions = {}) =>
  turnChangeForEvent(fakeGitHub(items, options).github, { repo, payload });

describe("turn change for an author's event", () => {
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
});

describe("turn change for a relayed review", () => {
  it("gives the author the turn on a changes-requested review from someone who can push", async () => {
    assert.deepEqual(await changeFor(relayRun(), [review("CHANGES_REQUESTED", "maintainer", true, 1)]), { number: 7, add: true });
  });

  it("ignores changes requested by someone who cannot push, or by a bot", async () => {
    assert.equal(await changeFor(relayRun(), [review("CHANGES_REQUESTED", "passer-by", false, 1)]), null);
    assert.equal(await changeFor(relayRun(), [review("CHANGES_REQUESTED", "review-bot", true, 1, HEAD, "Bot")]), null);
  });

  it("hands the turn back on an approval from someone who can push", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), review("APPROVED", "maintainer", true, 1)];
    assert.deepEqual(await changeFor(relayRun(), items, { labelled: true }), { number: 7, add: false });
  });

  it("ignores approvals from someone who cannot push, and comment-only reviews", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9)];
    assert.equal(await changeFor(relayRun(), [...items, review("APPROVED", "passer-by", false, 1)], { labelled: true }), null);
    assert.equal(await changeFor(relayRun(), [...items, review("COMMENTED", "maintainer", true, 1)], { labelled: true }), null);
  });

  it("hands the turn back when the author replies in a review", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), review("COMMENTED", AUTHOR, false, 1)];
    assert.deepEqual(await changeFor(relayRun(), items, { labelled: true }), { number: 7, add: false });
  });

  it("hands the turn back when a changes-requested review is dismissed", async () => {
    const items = [review("DISMISSED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), dismissal(1)];
    assert.deepEqual(await changeFor(relayRun(), items, { labelled: true }), { number: 7, add: false });
  });

  it("goes by the latest review, whichever run arrives first", async () => {
    const items = [review("CHANGES_REQUESTED", "maintainer", true, 2), review("APPROVED", "other-maintainer", true, 1)];
    assert.equal(await changeFor(relayRun(), items), null);
  });

  it("does not add the label when the author answered before the run", async () => {
    assert.equal(await changeFor(relayRun(), [review("CHANGES_REQUESTED", "maintainer", true, 2, "older-sha")]), null);
    assert.equal(await changeFor(relayRun(), [review("CHANGES_REQUESTED", "maintainer", true, 2), comment(AUTHOR, 1)]), null);
  });

  it("keeps a label added by hand", async () => {
    assert.equal(await changeFor(relayRun(), [review("APPROVED", "maintainer", true, 10), labelEvent("LabeledEvent", 1)], { labelled: true }), null);
  });

  it("reads further back when the newest page moves nothing", async () => {
    const noise = Array.from({ length: 5 }, (_, index) => comment("maintainer", 5 - index));
    const { github, reads } = fakeGitHub([review("CHANGES_REQUESTED", "maintainer", true, 10), ...noise], { pageSize: 2 });
    assert.deepEqual(await turnChangeForEvent(github, { repo, payload: relayRun() }), { number: 7, add: true });
    assert.ok(reads.pages > 1);
  });

  it("ignores a run built from another PR, whatever its title says", async () => {
    const { github, reads } = fakeGitHub([review("CHANGES_REQUESTED", "maintainer", true, 1)]);
    assert.equal(await turnChangeForEvent(github, { repo, payload: relayRun({ headRepo: "attacker/r" }) }), null);
    assert.equal(await turnChangeForEvent(github, { repo, payload: relayRun({ headBranch: "other" }) }), null);
    assert.equal(await turnChangeForEvent(github, { repo, payload: relayRun({ event: "pull_request" }) }), null);
    assert.equal(reads.pages, 0);
  });

  it("ignores runs it did not relay, and PRs that do not exist", async () => {
    assert.equal(await changeFor(relayRun({ title: "Something else" })), null);
    assert.equal(await changeFor(relayRun(), [], { missing: true }), null);
  });
});

describe("update turn label", () => {
  const core = { info: () => {} };

  it("adds the label", async () => {
    const { github, calls } = fakeGitHub([review("CHANGES_REQUESTED", "maintainer", true, 1)]);
    await updateTurnLabel({ github, context: { repo, payload: relayRun() }, core });
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

describe("clear stale turn label", () => {
  const issue = { ...repo, issue_number: 7 };
  const answered = [review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9), review("COMMENTED", AUTHOR, false, 1)];

  it("removes a label whose turn has moved on", async () => {
    const { github, calls } = fakeGitHub(answered);
    assert.equal(await clearStaleTurnLabel(github, issue, true), true);
    assert.deepEqual(calls, ["unlabel #7 waiting-on-author"]);
  });

  it("keeps a label that still stands", async () => {
    const { github, calls } = fakeGitHub([review("CHANGES_REQUESTED", "maintainer", true, 10), labelEvent("LabeledEvent", 9)]);
    assert.equal(await clearStaleTurnLabel(github, issue, true), false);
    assert.deepEqual(calls, []);
  });

  it("changes nothing in a dry run", async () => {
    const { github, calls } = fakeGitHub(answered);
    assert.equal(await clearStaleTurnLabel(github, issue, false), true);
    assert.deepEqual(calls, []);
  });
});
