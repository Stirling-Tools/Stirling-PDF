import assert from "node:assert/strict";
import { describe, it } from "node:test";

import triageStalePullRequests, {
  closingComment,
  type Core,
  decide,
  type GitHubClient,
  LABELS,
  type PullRequest,
  type PullRequestNode,
  type TimelineEvent,
  warningComment,
} from "./stale-prs.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

interface PullRequestOptions {
  number?: number;
  isDraft?: boolean;
  updatedDaysAgo?: number;
  authorType?: string;
}

function pullRequest({
  number = 1,
  isDraft = false,
  updatedDaysAgo = 0,
  authorType = "User",
}: PullRequestOptions = {}): PullRequest {
  return {
    number,
    url: `https://github.com/o/r/pull/${number}`,
    isDraft,
    updatedAt: daysAgo(updatedDaysAgo),
    baseRefName: "main",
    author: { login: "contributor", __typename: authorType },
    labels: [],
    timeline: [],
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

function happened(pr: PullRequest, typename: "ReopenedEvent" | "ReadyForReviewEvent" | "ConvertToDraftEvent", daysAgoHappened: number) {
  pr.timeline.push({ __typename: typename, createdAt: daysAgo(daysAgoHappened) });
  return pr;
}

const decision = (pr: PullRequest) => decide(pr, NOW);
const actionFor = (pr: PullRequest) => decision(pr).action;
const conflicted = (daysAgoAdded: number) => label(pullRequest(), LABELS.conflicts, daysAgoAdded);

describe("ready PRs", () => {
  it("does nothing without a turn label, however old", () => {
    assert.equal(actionFor(pullRequest({ updatedDaysAgo: 200 })), "none");
  });

  for (const name of [LABELS.conflicts, LABELS.waitingOnAuthor]) {
    it(`warns once ${name} has been on for 7 days`, () => {
      assert.equal(actionFor(label(pullRequest(), name, 7)), "warn");
    });

    it(`waits while ${name} is younger than 7 days`, () => {
      assert.equal(actionFor(label(pullRequest(), name, 6)), "none");
    });
  }

  it("counts a conflict from when the label was last added", () => {
    const pr = label(unlabel(conflicted(20), LABELS.conflicts, 10), LABELS.conflicts, 3);
    assert.equal(actionFor(pr), "none");
  });

  it("names only the reasons that are due", () => {
    const pr = label(conflicted(9), LABELS.waitingOnAuthor, 2);
    assert.deepEqual(decision(pr), { action: "warn", reasons: ["conflicts"] });
  });

  it("ignores bot-authored PRs", () => {
    assert.equal(actionFor(label(pullRequest({ authorType: "Bot" }), LABELS.conflicts, 30)), "none");
  });

  it("ignores PRs on hold", () => {
    assert.equal(actionFor(label(conflicted(30), LABELS.onHold, 1)), "none");
  });

  it("gives a full period after Stale PR is removed", () => {
    assert.equal(actionFor(unlabel(label(conflicted(30), LABELS.stale, 5), LABELS.stale, 3)), "none");
    assert.equal(actionFor(unlabel(label(conflicted(30), LABELS.stale, 9), LABELS.stale, 7)), "warn");
  });
});

describe("ready PRs after the warning", () => {
  it("stays pending until the week is up", () => {
    assert.equal(actionFor(label(conflicted(20), LABELS.stale, 6)), "pending");
  });

  it("closes a week after the warning", () => {
    assert.deepEqual(decision(label(conflicted(20), LABELS.stale, 7)), { action: "close", reasons: ["conflicts"] });
  });

  it("clears once the turn label is removed", () => {
    assert.equal(actionFor(unlabel(label(conflicted(20), LABELS.stale, 7), LABELS.conflicts, 1)), "clear");
  });

  it("clears when a conflict is resolved and a new one appears", () => {
    const pr = label(unlabel(label(conflicted(20), LABELS.stale, 8), LABELS.conflicts, 3), LABELS.conflicts, 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when one of two reasons is resolved", () => {
    const pr = unlabel(label(label(conflicted(20), LABELS.waitingOnAuthor, 20), LABELS.stale, 8), LABELS.waitingOnAuthor, 1);
    assert.equal(actionFor(pr), "clear");
  });

  it("closes only for the reasons that were outstanding when it warned", () => {
    const pr = label(label(conflicted(20), LABELS.stale, 8), LABELS.waitingOnAuthor, 2);
    assert.deepEqual(decision(pr), { action: "close", reasons: ["conflicts"] });
  });

  it("clears on a reopened PR rather than closing it again", () => {
    assert.equal(actionFor(happened(label(conflicted(40), LABELS.stale, 20), "ReopenedEvent", 1)), "clear");
  });

  it("clears when it went to draft and back since the warning", () => {
    const pr = label(conflicted(20), LABELS.stale, 8);
    happened(pr, "ConvertToDraftEvent", 3);
    happened(pr, "ReadyForReviewEvent", 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when it is put on hold", () => {
    assert.equal(actionFor(label(label(conflicted(20), LABELS.stale, 8), LABELS.onHold, 1)), "clear");
  });
});

describe("drafts", () => {
  const draft = (updatedDaysAgo: number) => pullRequest({ isDraft: true, updatedDaysAgo });

  it("warns once nothing has touched it for 30 days", () => {
    assert.deepEqual(decision(draft(30)), { action: "warn", reasons: ["idleDraft"] });
  });

  it("waits before 30 days", () => {
    assert.equal(actionFor(draft(29)), "none");
  });

  it("ignores turn labels, which are for ready PRs", () => {
    assert.equal(actionFor(label(draft(3), LABELS.conflicts, 20)), "none");
  });

  it("stays pending while untouched since the warning", () => {
    assert.equal(actionFor(label(draft(3), LABELS.stale, 3)), "pending");
  });

  it("closes a week after the warning if still untouched", () => {
    assert.deepEqual(decision(label(draft(7), LABELS.stale, 7)), { action: "close", reasons: ["idleDraft"] });
  });

  it("clears once something touches it after the warning", () => {
    assert.equal(actionFor(label(draft(2), LABELS.stale, 7)), "clear");
  });

  it("clears when a ready PR warned about conflicts becomes a draft", () => {
    const pr = label(label(draft(1), LABELS.conflicts, 20), LABELS.stale, 8);
    happened(pr, "ConvertToDraftEvent", 1);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears a draft warning once the PR is marked ready", () => {
    const pr = label(label(pullRequest(), LABELS.conflicts, 40), LABELS.stale, 8);
    happened(pr, "ReadyForReviewEvent", 1);
    assert.equal(actionFor(pr), "clear");
  });
});

describe("comments", () => {
  const pr = label(label(pullRequest(), LABELS.conflicts, 9), LABELS.waitingOnAuthor, 8);
  const reasons = decision(pr).reasons;

  it("tells the author every reason and how to fix it", () => {
    const body = warningComment(pr, reasons, NOW);
    assert.match(body, /@contributor/);
    assert.match(body, /merge conflicts with `main`\. Merging or rebasing/);
    assert.match(body, /waiting on a response from you\. A reply, a new push/);
    assert.match(body, /closed automatically/);
    assert.match(body, /a maintainer can add the on-hold label/);
  });

  it("says how long a draft has been idle", () => {
    assert.match(warningComment(pullRequest({ isDraft: true, updatedDaysAgo: 31 }), ["idleDraft"], NOW), /for 31 days/);
  });

  it("does not misstate a closed draft's idle time, which the reminder reset", () => {
    const body = closingComment(pullRequest({ isDraft: true, updatedDaysAgo: 7 }), ["idleDraft"], NOW);
    assert.match(body, /no activity since the reminder/);
    assert.doesNotMatch(body, /for 7 days\./);
  });

  it("explains the close and how to reopen", () => {
    const body = closingComment(pr, reasons, NOW);
    assert.match(body, /closed automatically/);
    assert.match(body, /reopen it/);
    assert.doesNotMatch(body, /keeps it open/);
  });

  it("stays ASCII", () => {
    for (const body of [warningComment(pr, reasons, NOW), closingComment(pr, reasons, NOW)]) {
      assert.match(body, /^[\x20-\x7E\n]*$/);
    }
  });
});

// The cursor is the index of the page's first event, so `before` slices the timeline.
function toNode(pr: PullRequest, pageSize: number, before: string | null): PullRequestNode {
  const end = before === null ? pr.timeline.length : Number(before);
  const start = Math.max(0, end - pageSize);
  return {
    number: pr.number,
    state: "OPEN",
    url: pr.url,
    isDraft: pr.isDraft,
    updatedAt: pr.updatedAt,
    baseRefName: pr.baseRefName,
    author: pr.author,
    labels: { nodes: pr.labels.map((name) => ({ name })) },
    timelineItems: {
      pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) },
      nodes: pr.timeline.slice(start, end) satisfies TimelineEvent[],
    },
  };
}

interface FakeOptions {
  /** What pulls.get reports for mergeable. */
  mergeable?: boolean | null;
  timelinePageSize?: number;
  failFor?: number;
  alreadyRemoved?: string[];
}

function fakeGitHub(prs: PullRequest[], { mergeable = false, timelinePageSize = 100, failFor, alreadyRemoved = [] }: FakeOptions = {}) {
  const calls: string[] = [];
  const writeTimes: number[] = [];
  const reads = { mergeable: 0, pages: 0 };
  const write = (call: string) => {
    calls.push(call);
    writeTimes.push(Date.now());
  };
  const graphql = async (query: string, variables: Record<string, unknown>) => {
    if (query.includes("pullRequests(states: OPEN")) {
      const nodes = prs.map((pr) => ({ number: pr.number }));
      return { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
    }
    if (variables.number === failFor) throw new Error("boom");
    reads.pages += 1;
    const pr = prs.find((candidate) => candidate.number === variables.number);
    assert.ok(pr);
    return { repository: { pullRequest: toNode(pr, timelinePageSize, (variables.before as string | null) ?? null) } };
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
  const core: Core = { info: () => {}, error: (message) => errors.push(message), setFailed: (message) => failed.push(message), summary };
  return { core, errors, failed, summaries: () => summaries };
}

async function triage(github: GitHubClient, { live = true, writeIntervalMs = 0 } = {}) {
  const recorded = recordingCore();
  await triageStalePullRequests({
    github,
    context: { repo: { owner: "o", repo: "r" } },
    core: recorded.core,
    live,
    writeIntervalMs,
    mergeabilityRetryMs: 0,
  });
  return recorded;
}

describe("triage run", () => {
  // Dated well before the real clock, which the run reads, so the close is always due.
  const overdue = () => label(conflicted(40), LABELS.stale, 30);

  it("warns: comments, then labels", async () => {
    const { github, calls } = fakeGitHub([conflicted(10)]);
    await triage(github);
    assert.deepEqual(calls, ["comment #1", "label #1 Stale PR"]);
  });

  it("closes: comments, labels it backlog-cleanup, then closes", async () => {
    const { github, calls } = fakeGitHub([overdue()]);
    const { errors } = await triage(github);
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, ["comment #1", "label #1 backlog-cleanup", "close #1"]);
  });

  it("changes nothing in a dry run", async () => {
    const { github, calls } = fakeGitHub([overdue()]);
    await triage(github, { live: false });
    assert.deepEqual(calls, []);
  });

  it("does not warn about a conflict GitHub no longer reports", async () => {
    const { github, calls } = fakeGitHub([conflicted(10)], { mergeable: true });
    await triage(github);
    assert.deepEqual(calls, []);
  });

  it("does not close while GitHub cannot say whether it conflicts", async () => {
    const { github, calls, reads } = fakeGitHub([overdue()], { mergeable: null });
    await triage(github);
    assert.equal(reads.mergeable, 6);
    assert.deepEqual(calls, []);
  });

  it("still closes for another reason when the conflict is gone", async () => {
    const pr = label(label(conflicted(40), LABELS.waitingOnAuthor, 40), LABELS.stale, 30);
    const { github, calls } = fakeGitHub([pr], { mergeable: true });
    await triage(github);
    assert.deepEqual(calls, ["comment #1", "label #1 backlog-cleanup", "close #1"]);
  });

  it("reads a timeline longer than one page", async () => {
    const pr = conflicted(40);
    for (let day = 39; day > 0; day -= 1) label(pr, `noise-${day}`, day);
    const { github, calls, reads } = fakeGitHub([pr], { timelinePageSize: 10 });
    await triage(github);
    assert.ok(reads.pages > 1);
    assert.deepEqual(calls, ["comment #1", "label #1 Stale PR"]);
  });

  it("does not fail when the label it clears is already gone", async () => {
    const pr = unlabel(label(conflicted(20), LABELS.stale, 7), LABELS.conflicts, 1);
    pr.labels.push(LABELS.stale);
    const { github } = fakeGitHub([pr], { alreadyRemoved: [LABELS.stale] });
    const { errors, failed } = await triage(github);
    assert.deepEqual([errors, failed], [[], []]);
  });

  it("carries on past a PR that cannot be read, and still writes the summary", async () => {
    const { github, calls } = fakeGitHub([conflicted(10), label(pullRequest({ number: 2 }), LABELS.conflicts, 10)], { failFor: 1 });
    const { errors, failed, summaries } = await triage(github);
    assert.deepEqual(calls, ["comment #2", "label #2 Stale PR"]);
    assert.deepEqual(errors, ["#1: boom"]);
    assert.equal(failed.length, 1);
    assert.equal(summaries(), 1);
  });

  it("pauses between writes", async () => {
    const { github, writeTimes } = fakeGitHub([overdue()]);
    await triage(github, { writeIntervalMs: 30 });
    assert.equal(writeTimes.length, 3);
    for (let index = 1; index < writeTimes.length; index += 1) {
      assert.ok((writeTimes[index] ?? 0) - (writeTimes[index - 1] ?? 0) >= 28);
    }
  });
});
