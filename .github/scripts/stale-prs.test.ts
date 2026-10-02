import assert from "node:assert/strict";
import { describe, it } from "node:test";

import triageStalePullRequests, {
  closingComment,
  type Commit,
  type Core,
  decide,
  type EventPayload,
  type GitHubClient,
  LABELS,
  labelChange,
  type Page,
  type PullRequest,
  type PullRequestNode,
  pullNumbersForEvent,
  type Review,
  syncTurnLabels,
  type TimelineEvent,
  type TurnKind,
  warningComment,
} from "./stale-prs.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

const AUTHOR = "contributor";

function commit(login: string | null, committedDaysAgo: number, pushedDaysAgo = committedDaysAgo): Commit {
  return {
    committedDate: daysAgo(committedDaysAgo),
    author: { user: login === null ? null : { login } },
    checkSuites: { nodes: [{ createdAt: daysAgo(pushedDaysAgo) }] },
  };
}

interface PullRequestOptions {
  number?: number;
  isDraft?: boolean;
  mergeable?: PullRequest["mergeable"];
  pushedDaysAgo?: number;
  authorType?: string;
}

function pullRequest({
  number = 1,
  isDraft = false,
  mergeable = "MERGEABLE",
  pushedDaysAgo = 60,
  authorType = "User",
}: PullRequestOptions = {}): PullRequest {
  return {
    number,
    url: `https://github.com/o/r/pull/${number}`,
    isDraft,
    mergeable,
    baseRefName: "main",
    createdAt: daysAgo(90),
    author: { login: AUTHOR, __typename: authorType },
    labels: [],
    commits: [commit(AUTHOR, pushedDaysAgo)],
    reviews: [],
    comments: [],
    timeline: [],
    warning: null,
  };
}

function label(pr: PullRequest, name: string, daysAgoAdded: number) {
  pr.labels.push(name);
  pr.timeline.push({ __typename: "LabeledEvent", createdAt: daysAgo(daysAgoAdded), label: { name } });
  return pr;
}

function unlabel(pr: PullRequest, name: string, daysAgoRemoved: number) {
  pr.labels = pr.labels.filter((existing) => existing !== name);
  pr.timeline.push({ __typename: "UnlabeledEvent", createdAt: daysAgo(daysAgoRemoved), label: { name } });
  return pr;
}

function warned(pr: PullRequest, daysAgoWarned: number, kinds: TurnKind[]) {
  pr.warning = { at: Date.parse(daysAgo(daysAgoWarned)), kinds };
  return label(pr, LABELS.stale, daysAgoWarned);
}

interface Reviewer {
  login?: string;
  association?: string;
  canPush?: boolean;
  type?: string;
}

function review(
  pr: PullRequest,
  state: Review["state"],
  daysAgoSubmitted: number,
  { login = "maintainer", association = "MEMBER", canPush = false, type = "User" }: Reviewer = {},
) {
  pr.reviews.push({
    state,
    submittedAt: daysAgo(daysAgoSubmitted),
    authorAssociation: association,
    authorCanPushToRepository: canPush,
    author: { login, __typename: type },
  });
  return pr;
}

function comment(pr: PullRequest, login: string, daysAgoPosted: number) {
  pr.comments.push({ createdAt: daysAgo(daysAgoPosted), author: { login } });
  return pr;
}

type ActorEvent = "ReadyForReviewEvent" | "ConvertToDraftEvent" | "ReviewRequestedEvent" | "HeadRefForcePushedEvent";

function acted(pr: PullRequest, typename: ActorEvent, daysAgoHappened: number, actor = AUTHOR) {
  pr.timeline.push({ __typename: typename, createdAt: daysAgo(daysAgoHappened), actor: { login: actor } });
  return pr;
}

function reopened(pr: PullRequest, daysAgoHappened: number) {
  pr.timeline.push({ __typename: "ReopenedEvent", createdAt: daysAgo(daysAgoHappened) });
  return pr;
}

const actionFor = (pr: PullRequest) => decide(pr, NOW).action;
const kindsOf = (pr: PullRequest) => decide(pr, NOW).turns.map((turn) => turn.kind);

describe("waiting on maintainers", () => {
  it("never warns an old PR nobody has reviewed", () => {
    assert.equal(actionFor(pullRequest({ pushedDaysAgo: 200 })), "none");
  });

  it("never warns an approved PR", () => {
    assert.equal(actionFor(review(pullRequest(), "APPROVED", 40)), "none");
  });

  it("ignores bot-authored PRs", () => {
    const pr = label(pullRequest({ mergeable: "CONFLICTING", authorType: "Bot" }), LABELS.conflicts, 30);
    assert.equal(actionFor(pr), "none");
  });

  it("ignores PRs labelled on-hold", () => {
    const pr = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 30), LABELS.onHold, 1);
    assert.equal(actionFor(pr), "none");
  });
});

describe("merge conflicts", () => {
  it("warns once the conflict is 7 days old", () => {
    const pr = label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 7);
    assert.equal(actionFor(pr), "warn");
  });

  it("waits while the conflict is younger than 7 days", () => {
    const pr = label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 6);
    assert.equal(actionFor(pr), "none");
  });

  it("counts from the conflict, not the author's last push or comment", () => {
    const pr = comment(label(pullRequest({ mergeable: "CONFLICTING", pushedDaysAgo: 2 }), LABELS.conflicts, 8), AUTHOR, 1);
    assert.equal(actionFor(pr), "warn");
  });

  it("does not warn on a conflict GitHub has not confirmed", () => {
    const pr = label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 8);
    assert.equal(actionFor(pr), "none");
  });

  it("ignores a lagging label once the PR is mergeable", () => {
    const pr = label(pullRequest({ mergeable: "MERGEABLE" }), LABELS.conflicts, 8);
    assert.equal(actionFor(pr), "none");
  });

  it("leaves conflicts on drafts to the idle-draft rule", () => {
    const pr = label(pullRequest({ isDraft: true, mergeable: "CONFLICTING", pushedDaysAgo: 3 }), LABELS.conflicts, 20);
    assert.equal(actionFor(pr), "none");
  });
});

describe("non-approving core review", () => {
  for (const state of ["COMMENTED", "CHANGES_REQUESTED"] as const) {
    it(`warns 7 days after a ${state} review with no reply or push`, () => {
      assert.equal(actionFor(review(pullRequest(), state, 7)), "warn");
    });
  }

  it("waits while the review is younger than 7 days", () => {
    assert.equal(actionFor(review(pullRequest(), "CHANGES_REQUESTED", 6)), "none");
  });

  it("hands the turn back when the author replies", () => {
    assert.equal(actionFor(comment(review(pullRequest(), "CHANGES_REQUESTED", 20), AUTHOR, 19)), "none");
  });

  it("hands the turn back when the author replies in a review thread", () => {
    const pr = review(review(pullRequest(), "CHANGES_REQUESTED", 20), "COMMENTED", 19, {
      login: AUTHOR,
      association: "CONTRIBUTOR",
    });
    assert.equal(actionFor(pr), "none");
  });

  it("hands the turn back when the author pushes", () => {
    assert.equal(actionFor(review(pullRequest({ pushedDaysAgo: 10 }), "CHANGES_REQUESTED", 20)), "none");
  });

  it("dates a push by when it reached GitHub, not when it was committed", () => {
    const pr = review(pullRequest(), "CHANGES_REQUESTED", 19);
    pr.commits = [commit(AUTHOR, 20, 18)];
    assert.equal(actionFor(pr), "none");
  });

  it("falls back to the commit date for a commit no checks ran on", () => {
    const pr = review(pullRequest(), "CHANGES_REQUESTED", 19);
    pr.commits = [{ ...commit(AUTHOR, 20), checkSuites: { nodes: [] } }];
    assert.equal(actionFor(pr), "warn");
  });

  it("hands the turn back when the author force-pushes", () => {
    assert.equal(actionFor(acted(review(pullRequest(), "CHANGES_REQUESTED", 20), "HeadRefForcePushedEvent", 10)), "none");
  });

  it("hands the turn back when the author re-requests review", () => {
    assert.equal(actionFor(acted(review(pullRequest(), "CHANGES_REQUESTED", 20), "ReviewRequestedEvent", 10)), "none");
  });

  it("does not count a maintainer re-requesting review", () => {
    const pr = acted(review(pullRequest(), "CHANGES_REQUESTED", 20), "ReviewRequestedEvent", 10, "maintainer");
    assert.equal(actionFor(pr), "warn");
  });

  it("does not count someone else's comment as the author replying", () => {
    assert.equal(actionFor(comment(review(pullRequest(), "CHANGES_REQUESTED", 20), "maintainer", 10)), "warn");
  });

  it("does nothing when a later core review approved", () => {
    const pr = review(review(pullRequest(), "CHANGES_REQUESTED", 20), "APPROVED", 15, { login: "other" });
    assert.equal(actionFor(pr), "none");
  });

  it("keeps an approval standing through a later comment-only review", () => {
    const pr = review(review(pullRequest(), "APPROVED", 20), "COMMENTED", 15, { login: "other" });
    assert.equal(actionFor(pr), "none");
  });

  it("warns when changes are requested after an approval", () => {
    const pr = review(review(pullRequest(), "APPROVED", 20), "CHANGES_REQUESTED", 15, { login: "other" });
    assert.equal(actionFor(pr), "warn");
  });

  it("ignores reviews from outside the core team", () => {
    assert.equal(actionFor(review(pullRequest(), "CHANGES_REQUESTED", 20, { association: "CONTRIBUTOR" })), "none");
  });

  it("counts a reviewer who can push even when their association reads CONTRIBUTOR", () => {
    const pr = review(pullRequest(), "CHANGES_REQUESTED", 20, { association: "CONTRIBUTOR", canPush: true });
    assert.equal(actionFor(pr), "warn");
  });

  it("ignores bot reviewers", () => {
    assert.equal(actionFor(review(pullRequest(), "COMMENTED", 20, { login: "copilot", type: "Bot" })), "none");
  });

  it("ignores dismissed reviews", () => {
    assert.equal(actionFor(review(pullRequest(), "DISMISSED", 20)), "none");
  });

  it("ignores a core author reviewing their own PR", () => {
    assert.equal(actionFor(review(pullRequest(), "COMMENTED", 20, { login: AUTHOR })), "none");
  });
});

describe("needs-changes label", () => {
  it("warns 7 days after a maintainer adds it", () => {
    assert.equal(actionFor(label(pullRequest(), LABELS.needsChanges, 7)), "warn");
  });

  it("hands the turn back when the author replies", () => {
    assert.equal(actionFor(comment(label(pullRequest(), LABELS.needsChanges, 10), AUTHOR, 5)), "none");
  });

  it("leaves drafts to the idle-draft rule", () => {
    assert.equal(actionFor(label(pullRequest({ isDraft: true, pushedDaysAgo: 8 }), LABELS.needsChanges, 7)), "none");
  });
});

describe("idle drafts", () => {
  it("warns after 30 days without author activity", () => {
    assert.equal(actionFor(pullRequest({ isDraft: true, pushedDaysAgo: 30 })), "warn");
  });

  it("waits before 30 days", () => {
    assert.equal(actionFor(pullRequest({ isDraft: true, pushedDaysAgo: 29 })), "none");
  });

  it("counts the author converting to draft as activity", () => {
    const pr = acted(pullRequest({ isDraft: true, pushedDaysAgo: 60 }), "ConvertToDraftEvent", 5);
    assert.equal(actionFor(pr), "none");
  });

  it("does not count a maintainer converting it to draft", () => {
    const pr = acted(pullRequest({ isDraft: true, pushedDaysAgo: 60 }), "ConvertToDraftEvent", 5, "maintainer");
    assert.equal(actionFor(pr), "warn");
  });

  it("does not count a maintainer's Update branch as the author pushing", () => {
    const pr = pullRequest({ isDraft: true, pushedDaysAgo: 40 });
    pr.commits.push(commit("maintainer", 1));
    assert.equal(actionFor(pr), "warn");
  });

  it("counts a commit with no linked account as the author's", () => {
    const pr = pullRequest({ isDraft: true, pushedDaysAgo: 40 });
    pr.commits.push(commit(null, 1));
    assert.equal(actionFor(pr), "none");
  });
});

describe("warning", () => {
  const conflicted = () => label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 20);

  it("names only the turns that are due", () => {
    const pr = review(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 9), "CHANGES_REQUESTED", 2);
    assert.deepEqual(kindsOf(pr), ["conflicts"]);
  });

  it("does not warn again after a maintainer removes the label", () => {
    const pr = unlabel(warned(conflicted(), 3, ["conflicts"]), LABELS.stale, 1);
    assert.equal(actionFor(pr), "none");
  });

  it("warns again a full period after the label was removed", () => {
    const pr = unlabel(warned(conflicted(), 10, ["conflicts"]), LABELS.stale, 7);
    assert.equal(actionFor(pr), "warn");
  });

  it("posts the warning for a label added by hand once something is due", () => {
    assert.equal(actionFor(label(review(pullRequest(), "CHANGES_REQUESTED", 8), LABELS.stale, 1)), "warn");
  });

  it("leaves a label added by hand alone while nothing is due", () => {
    assert.equal(actionFor(label(review(pullRequest(), "CHANGES_REQUESTED", 3), LABELS.stale, 1)), "none");
  });
});

describe("after the warning", () => {
  const conflicted = () => label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 20);

  it("closes 7 days after the warning if still outstanding", () => {
    const pr = warned(conflicted(), 7, ["conflicts"]);
    assert.equal(actionFor(pr), "close");
    assert.deepEqual(kindsOf(pr), ["conflicts"]);
  });

  it("stays pending until the week is up", () => {
    assert.equal(actionFor(warned(conflicted(), 6, ["conflicts"])), "pending");
  });

  it("stays pending while the conflict it would close on is unconfirmed", () => {
    const pr = warned(label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 20), 8, ["conflicts"]);
    assert.equal(actionFor(pr), "pending");
  });

  it("clears once the conflict is resolved", () => {
    const pr = warned(label(pullRequest({ mergeable: "MERGEABLE" }), LABELS.conflicts, 20), 3, ["conflicts"]);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when a new conflict replaces the one it warned about", () => {
    const pr = label(warned(pullRequest({ mergeable: "CONFLICTING" }), 8, ["conflicts"]), LABELS.conflicts, 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when the author replies to the review", () => {
    const pr = comment(warned(review(pullRequest(), "CHANGES_REQUESTED", 20), 8, ["review"]), AUTHOR, 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears on a reopened PR rather than closing it again", () => {
    const pr = reopened(warned(conflicted(), 30, ["conflicts"]), 1);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when a maintainer adds on-hold", () => {
    assert.equal(actionFor(label(warned(conflicted(), 8, ["conflicts"]), LABELS.onHold, 1)), "clear");
  });

  it("does not close for a reason that only started after the warning", () => {
    const pr = warned(label(pullRequest(), LABELS.needsChanges, 12), 10, ["needsChanges"]);
    comment(pr, AUTHOR, 9);
    review(pr, "CHANGES_REQUESTED", 8);
    assert.equal(actionFor(pr), "clear");
  });

  it("does not close for an older reason the warning did not name", () => {
    const pr = warned(conflicted(), 8, ["idleDraft"]);
    acted(pr, "ReadyForReviewEvent", 7);
    assert.equal(actionFor(pr), "clear");
  });

  it("does not close as an idle draft when it was warned about a review", () => {
    const pr = warned(review(pullRequest({ isDraft: true, pushedDaysAgo: 10 }), "CHANGES_REQUESTED", 9), 8, ["review"]);
    acted(pr, "ConvertToDraftEvent", 1, "maintainer");
    assert.equal(actionFor(pr), "clear");
  });
});

describe("reopened PRs", () => {
  const closedForConflicts = () => {
    const pr = warned(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 40), 20, ["conflicts"]);
    return label(pr, LABELS.backlogCleanup, 13);
  };

  it("gets a full period before it is warned again", () => {
    const pr = unlabel(reopened(closedForConflicts(), 2), LABELS.stale, 1);
    assert.equal(actionFor(pr), "none");
  });

  it("is warned again once that period passes", () => {
    const pr = unlabel(reopened(closedForConflicts(), 8), LABELS.stale, 7);
    assert.equal(actionFor(pr), "warn");
  });

  it("loses backlog-cleanup", () => {
    assert.deepEqual(labelChange(reopened(closedForConflicts(), 1)).remove, [LABELS.backlogCleanup]);
  });
});

describe("comments", () => {
  const pr = review(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 9), "CHANGES_REQUESTED", 8);
  const { turns } = decide(pr, NOW);

  it("tells the author every reason that is due and how to fix it", () => {
    const body = warningComment(pr, turns, NOW);
    assert.match(body, /@contributor/);
    assert.match(body, /merge conflicts with `main`\. Merging or rebasing/);
    assert.match(body, /from maintainer, hasn't had a reply or a new push/);
    assert.match(body, /closed automatically/);
  });

  it("records the turns it names", () => {
    assert.match(warningComment(pr, turns, NOW), /<!-- stale-pr-warning: conflicts,review -->$/);
  });

  it("explains the close and how to reopen", () => {
    const body = closingComment(pr, turns, NOW);
    assert.match(body, /closed automatically/);
    assert.match(body, /reopen it/);
    assert.doesNotMatch(body, /keeps it open/);
  });

  it("stays ASCII", () => {
    for (const body of [warningComment(pr, turns, NOW), closingComment(pr, turns, NOW)]) {
      assert.match(body, /^[\x20-\x7E\n]*$/);
    }
  });
});

describe("labels", () => {
  const turnLabel = (pr: PullRequest) => labelChange(pr).add[0] ?? pr.labels.find((name) => name.startsWith("waiting-on"));

  it("puts an unreviewed PR on review", () => {
    assert.equal(turnLabel(pullRequest()), LABELS.waitingOnReview);
  });

  it("puts an approved PR on review", () => {
    assert.equal(turnLabel(review(pullRequest(), "APPROVED", 3)), LABELS.waitingOnReview);
  });

  it("moves a PR to the author as soon as it conflicts", () => {
    assert.equal(turnLabel(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 0)), LABELS.waitingOnAuthor);
  });

  it("trusts the conflict label while GitHub reports mergeability as unknown", () => {
    assert.equal(turnLabel(label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 0)), LABELS.waitingOnAuthor);
  });

  it("moves a PR to the author as soon as a core review asks for changes", () => {
    assert.equal(turnLabel(review(pullRequest(), "CHANGES_REQUESTED", 0)), LABELS.waitingOnAuthor);
  });

  it("moves it back to review when the author replies", () => {
    assert.equal(turnLabel(comment(review(pullRequest(), "CHANGES_REQUESTED", 3), AUTHOR, 1)), LABELS.waitingOnReview);
  });

  it("puts drafts on the author", () => {
    assert.equal(turnLabel(pullRequest({ isDraft: true, pushedDaysAgo: 0 })), LABELS.waitingOnAuthor);
  });

  it("still labels PRs that are exempt from closing", () => {
    const onHold = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 1), LABELS.onHold, 1);
    assert.equal(turnLabel(onHold), LABELS.waitingOnAuthor);
    assert.equal(turnLabel(pullRequest({ authorType: "Bot" })), LABELS.waitingOnReview);
  });

  it("swaps the old label for the new one", () => {
    const pr = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.waitingOnReview, 5), LABELS.conflicts, 1);
    assert.deepEqual(labelChange(pr), { add: [LABELS.waitingOnAuthor], remove: [LABELS.waitingOnReview] });
  });

  it("changes nothing when the label is already right", () => {
    assert.deepEqual(labelChange(label(pullRequest(), LABELS.waitingOnReview, 5)), { add: [], remove: [] });
  });
});

const COMPLETE = { hasPreviousPage: false, startCursor: null };

// The cursor is the index of the page's first node, so `before` slices the history.
function paged<T>(nodes: T[], pageSize: number, before: string | null = null): Page<T> {
  const end = before === null ? nodes.length : Number(before);
  const start = Math.max(0, end - pageSize);
  return { pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) }, nodes: nodes.slice(start, end) };
}

function toNode(pr: PullRequest, pageSize: number): PullRequestNode {
  return {
    number: pr.number,
    state: "OPEN",
    url: pr.url,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    baseRefName: pr.baseRefName,
    createdAt: pr.createdAt,
    author: pr.author,
    labels: { nodes: pr.labels.map((name) => ({ name })) },
    commits: { nodes: pr.commits.map((prCommit) => ({ commit: prCommit })) },
    reviews: paged(pr.reviews, pageSize),
    comments: paged(pr.comments, pageSize),
    timelineItems: paged<TimelineEvent>(pr.timeline, pageSize),
  };
}

function warningComments(pr: PullRequest) {
  const nodes = pr.warning
    ? [
        {
          createdAt: new Date(pr.warning.at).toISOString(),
          body: `Hi\n\n<!-- stale-pr-warning: ${pr.warning.kinds.join(",")} -->`,
          author: { __typename: "Bot" },
        },
      ]
    : [];
  return { pageInfo: COMPLETE, nodes };
}

interface FakeGitHubOptions {
  /** Labels whose removal fails with a 404, as if someone removed them first. */
  alreadyRemoved?: string[];
  /** What pulls.get reports for mergeable. */
  mergeable?: boolean | null;
  historyPageSize?: number;
  failGraphqlFor?: number;
  headPulls?: number[];
}

function fakeGitHub(listed: PullRequest[], options: FakeGitHubOptions = {}) {
  const { alreadyRemoved = [], mergeable = null, historyPageSize = 100, headPulls = [] } = options;
  const calls: string[] = [];
  const writeTimes: number[] = [];
  const reads = { mergeable: 0, olderPages: 0 };
  const write = (call: string) => {
    calls.push(call);
    writeTimes.push(Date.now());
  };
  const find = (number: unknown) => {
    const pr = listed.find((candidate) => candidate.number === number);
    assert.ok(pr, `no PR #${String(number)}`);
    return pr;
  };

  const graphql = async (query: string, variables: Record<string, unknown>) => {
    if (options.failGraphqlFor !== undefined && variables.number === options.failGraphqlFor) throw new Error("boom");
    if (query.includes("pullRequests(states: OPEN")) {
      const nodes = listed.map((pr) => ({ number: pr.number }));
      return { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
    }
    const field = /pullRequest\(number: \$number\) \{\s*(\w+)/.exec(query)?.[1];
    const pr = find(variables.number);
    const before = (variables.before as string | null | undefined) ?? null;
    if (field === "number") return { repository: { pullRequest: toNode(pr, historyPageSize) } };
    if (field === "comments" && query.includes("body")) return { repository: { pullRequest: { comments: warningComments(pr) } } };
    reads.olderPages += 1;
    const history = { reviews: pr.reviews, comments: pr.comments, timelineItems: pr.timeline };
    assert.ok(field === "reviews" || field === "comments" || field === "timelineItems", `unexpected query for ${field}`);
    return { repository: { pullRequest: { [field]: paged<unknown>(history[field], historyPageSize, before) } } };
  };

  const github: GitHubClient = {
    graphql: async <T>(query: string, variables: Record<string, unknown>) => (await graphql(query, variables)) as T,
    rest: {
      issues: {
        createComment: async ({ issue_number }) => write(`comment #${issue_number}`),
        addLabels: async ({ issue_number, labels }) => write(`label #${issue_number} ${labels.join(",")}`),
        removeLabel: async ({ issue_number, name }) => {
          if (alreadyRemoved.includes(name)) throw Object.assign(new Error("Label does not exist"), { status: 404 });
          write(`unlabel #${issue_number} ${name}`);
        },
      },
      pulls: {
        get: async () => {
          reads.mergeable += 1;
          return { data: { mergeable } };
        },
        list: async () => ({ data: headPulls.map((number) => ({ number })) }),
        update: async ({ pull_number }) => write(`close #${pull_number}`),
      },
    },
  };
  return { github, calls, writeTimes, reads };
}

function recordingCore() {
  const errors: string[] = [];
  const failed: string[] = [];
  let summaries = 0;
  const summary: Core["summary"] = {
    addHeading: () => summary,
    addRaw: () => summary,
    addTable: () => summary,
    write: async () => {
      summaries += 1;
      return summary;
    },
  };
  const core: Core = {
    info: () => {},
    error: (message) => errors.push(message),
    setFailed: (message) => failed.push(message),
    summary,
  };
  return { core, errors, failed, summaries: () => summaries };
}

const repo = { owner: "o", repo: "r" };

async function triage(github: GitHubClient, { live = true, writeIntervalMs = 0 } = {}) {
  const recorded = recordingCore();
  await triageStalePullRequests({ github, context: { repo }, core: recorded.core, live, writeIntervalMs, mergeabilityRetryMs: 0 });
  return recorded;
}

describe("triage run", () => {
  // Dated well before the real clock, which the run reads, so the close is always due.
  const overdue = () =>
    warned(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 40), 30, ["conflicts"]);

  it("comments, labels it backlog-cleanup, then closes", async () => {
    const { github, calls } = fakeGitHub([overdue()]);
    const { errors } = await triage(github);
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, ["comment #1", "label #1 backlog-cleanup", "close #1"]);
  });

  it("labels a PR with whose turn it is", async () => {
    const { github, calls } = fakeGitHub([pullRequest()]);
    await triage(github);
    assert.deepEqual(calls, ["label #1 waiting-on-review"]);
  });

  it("warns, then moves the turn label to the author", async () => {
    const pr = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.waitingOnReview, 20), LABELS.conflicts, 10);
    const { github, calls } = fakeGitHub([pr]);
    await triage(github);
    assert.deepEqual(calls, [
      "comment #1",
      "label #1 Stale PR",
      "label #1 waiting-on-author",
      "unlabel #1 waiting-on-review",
    ]);
  });

  it("changes nothing in a dry run", async () => {
    const { github, calls } = fakeGitHub([overdue()]);
    await triage(github, { live: false });
    assert.deepEqual(calls, []);
  });

  it("reads history older than one page", async () => {
    const pr = label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 40);
    for (let day = 39; day > 0; day -= 1) label(pr, `noise-${day}`, day);
    const { github, calls, reads } = fakeGitHub([pr], { historyPageSize: 10 });
    await triage(github);
    assert.ok(reads.olderPages > 0);
    assert.deepEqual(calls.slice(0, 2), ["comment #1", "label #1 Stale PR"]);
  });

  it("does not close until GitHub confirms the conflict", async () => {
    const pr = warned(label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 40), 30, ["conflicts"]);
    const { github, calls, reads } = fakeGitHub([pr], { mergeable: null });
    await triage(github);
    assert.equal(reads.mergeable, 6);
    assert.deepEqual(calls, ["label #1 waiting-on-author"]);
  });

  it("clears when GitHub reports the conflict gone", async () => {
    const pr = warned(label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 40), 30, ["conflicts"]);
    const { github, calls } = fakeGitHub([pr], { mergeable: true });
    await triage(github);
    assert.deepEqual(calls, ["unlabel #1 Stale PR", "label #1 waiting-on-review"]);
  });

  it("does not fail when the label it clears is already gone", async () => {
    const pr = warned(label(pullRequest({ mergeable: "MERGEABLE" }), LABELS.conflicts, 20), 3, ["conflicts"]);
    label(pr, LABELS.waitingOnReview, 3);
    const { github } = fakeGitHub([pr], { alreadyRemoved: [LABELS.stale] });
    const { errors, failed } = await triage(github);
    assert.deepEqual([errors, failed], [[], []]);
  });

  it("carries on past a PR that cannot be read, and still writes the summary", async () => {
    const { github, calls } = fakeGitHub([pullRequest({ number: 1 }), pullRequest({ number: 2 })], {
      failGraphqlFor: 1,
    });
    const { errors, failed, summaries } = await triage(github);
    assert.deepEqual(calls, ["label #2 waiting-on-review"]);
    assert.deepEqual(errors, ["#1: boom"]);
    assert.equal(failed.length, 1);
    assert.equal(summaries(), 1);
  });

  it("pauses between every write, not just between PRs", async () => {
    const { github, writeTimes } = fakeGitHub([overdue()]);
    await triage(github, { writeIntervalMs: 30 });
    assert.equal(writeTimes.length, 3);
    for (let index = 1; index < writeTimes.length; index += 1) {
      assert.ok((writeTimes[index] ?? 0) - (writeTimes[index - 1] ?? 0) >= 28);
    }
  });
});

describe("turn label sync", () => {
  const sync = async (github: GitHubClient, pullNumbers: number[] | "all" = "all", live = true) => {
    const recorded = recordingCore();
    await syncTurnLabels({ github, context: { repo }, core: recorded.core, live, pullNumbers, writeIntervalMs: 0 });
    return recorded;
  };

  it("only touches labels, even on a PR that is due to close", async () => {
    const overdue = warned(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 40), 30, ["conflicts"]);
    const { github, calls } = fakeGitHub([overdue]);
    await sync(github);
    assert.deepEqual(calls, ["label #1 waiting-on-author"]);
  });

  it("syncs only the PRs it is given", async () => {
    const { github, calls } = fakeGitHub([pullRequest({ number: 1 }), pullRequest({ number: 2 })]);
    await sync(github, [2]);
    assert.deepEqual(calls, ["label #2 waiting-on-review"]);
  });

  it("leaves a correctly labelled PR alone", async () => {
    const { github, calls } = fakeGitHub([label(pullRequest(), LABELS.waitingOnReview, 5)]);
    await sync(github);
    assert.deepEqual(calls, []);
  });

  it("does not fail when the label it removes is already gone", async () => {
    const pr = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.waitingOnReview, 5), LABELS.conflicts, 1);
    const { github, calls } = fakeGitHub([pr], { alreadyRemoved: [LABELS.waitingOnReview] });
    const { errors } = await sync(github);
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, ["label #1 waiting-on-author"]);
  });

  it("changes nothing in a dry run", async () => {
    const { github, calls } = fakeGitHub([pullRequest()]);
    await sync(github, "all", false);
    assert.deepEqual(calls, []);
  });
});

describe("pull numbers for an event", () => {
  const numbersFor = (payload: EventPayload, headPulls: number[] = []) =>
    pullNumbersForEvent(fakeGitHub([], { headPulls }).github, { repo, payload });
  const run = (pullRequests: number[]) => ({
    pull_requests: pullRequests.map((number) => ({ number })),
    head_branch: "main",
    head_repository: { owner: { login: "fork-owner" } },
  });

  it("takes a pull request event's PR", async () => {
    assert.deepEqual(await numbersFor({ pull_request: { number: 7 } }), [7]);
  });

  it("takes the PR a comment is on, and nothing for an issue", async () => {
    assert.deepEqual(await numbersFor({ issue: { number: 7, pull_request: {} } }), [7]);
    assert.deepEqual(await numbersFor({ issue: { number: 7 } }), []);
  });

  it("takes a workflow run's PRs", async () => {
    assert.deepEqual(await numbersFor({ workflow_run: run([7]) }), [7]);
  });

  it("finds a fork's PR by its head", async () => {
    assert.deepEqual(await numbersFor({ workflow_run: run([]) }, [9]), [9]);
  });

  it("covers every PR for an event that names none", async () => {
    assert.equal(await numbersFor({}), "all");
  });
});
