import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closingComment, decide, LABELS, warningComment } from "./stale-prs.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-01T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

const AUTHOR = "contributor";

function pullRequest({ isDraft = false, mergeable = "MERGEABLE", pushedDaysAgo = 60, authorType = "User" } = {}) {
  return {
    number: 1,
    url: "https://github.com/o/r/pull/1",
    isDraft,
    mergeable,
    baseRefName: "main",
    createdAt: daysAgo(90),
    author: { login: AUTHOR, __typename: authorType },
    labels: { nodes: [] },
    commits: { nodes: [{ commit: { committedDate: daysAgo(pushedDaysAgo) } }] },
    reviews: { nodes: [] },
    comments: { nodes: [] },
    timelineItems: { nodes: [] },
  };
}

function label(pr, name, daysAgoAdded) {
  pr.labels.nodes.push({ name });
  pr.timelineItems.nodes.push({ __typename: "LabeledEvent", createdAt: daysAgo(daysAgoAdded), label: { name } });
  return pr;
}

function review(pr, state, daysAgoSubmitted, { login = "maintainer", association = "MEMBER", type = "User" } = {}) {
  pr.reviews.nodes.push({
    state,
    submittedAt: daysAgo(daysAgoSubmitted),
    authorAssociation: association,
    author: { login, __typename: type },
  });
  return pr;
}

function comment(pr, login, daysAgoPosted) {
  pr.comments.nodes.push({ createdAt: daysAgo(daysAgoPosted), author: { login } });
  return pr;
}

function timelineEvent(pr, typename, daysAgoHappened, actor = AUTHOR) {
  pr.timelineItems.nodes.push({ __typename: typename, createdAt: daysAgo(daysAgoHappened), actor: { login: actor } });
  return pr;
}

const actionFor = (pr) => decide(pr, NOW).action;

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

  it("trusts the label while GitHub reports mergeability as unknown", () => {
    const pr = label(pullRequest({ mergeable: "UNKNOWN" }), LABELS.conflicts, 8);
    assert.equal(actionFor(pr), "warn");
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
  for (const state of ["COMMENTED", "CHANGES_REQUESTED"]) {
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

  it("does not count someone else's comment as the author replying", () => {
    assert.equal(actionFor(comment(review(pullRequest(), "CHANGES_REQUESTED", 20), "maintainer", 10)), "warn");
  });

  it("does nothing when a later core review approved", () => {
    const pr = review(review(pullRequest(), "CHANGES_REQUESTED", 20), "APPROVED", 15, { login: "other" });
    assert.equal(actionFor(pr), "none");
  });

  it("ignores reviews from outside the core team", () => {
    assert.equal(actionFor(review(pullRequest(), "CHANGES_REQUESTED", 20, { association: "CONTRIBUTOR" })), "none");
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
});

describe("idle drafts", () => {
  it("warns after 30 days without author activity", () => {
    assert.equal(actionFor(pullRequest({ isDraft: true, pushedDaysAgo: 30 })), "warn");
  });

  it("waits before 30 days", () => {
    assert.equal(actionFor(pullRequest({ isDraft: true, pushedDaysAgo: 29 })), "none");
  });

  it("counts the author converting to draft as activity", () => {
    const pr = timelineEvent(pullRequest({ isDraft: true, pushedDaysAgo: 60 }), "ConvertToDraftEvent", 5);
    assert.equal(actionFor(pr), "none");
  });

  it("does not count a maintainer converting it to draft", () => {
    const pr = timelineEvent(pullRequest({ isDraft: true, pushedDaysAgo: 60 }), "ConvertToDraftEvent", 5, "maintainer");
    assert.equal(actionFor(pr), "warn");
  });
});

describe("after the warning", () => {
  const conflicted = () => label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 20);

  it("closes 7 days after the warning if still outstanding", () => {
    const decision = decide(label(conflicted(), LABELS.stale, 7), NOW);
    assert.equal(decision.action, "close");
    assert.deepEqual(
      decision.turns.map((turn) => turn.kind),
      ["conflicts"],
    );
  });

  it("stays pending until the week is up", () => {
    assert.equal(actionFor(label(conflicted(), LABELS.stale, 6)), "pending");
  });

  it("clears once the conflict is resolved", () => {
    const pr = label(label(pullRequest({ mergeable: "MERGEABLE" }), LABELS.conflicts, 20), LABELS.stale, 3);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when a new conflict replaces the one it warned about", () => {
    const pr = label(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.stale, 8), LABELS.conflicts, 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when the author replies to the review", () => {
    const pr = comment(label(review(pullRequest(), "CHANGES_REQUESTED", 20), LABELS.stale, 8), AUTHOR, 2);
    assert.equal(actionFor(pr), "clear");
  });

  it("clears on a reopened PR rather than closing it again", () => {
    const pr = timelineEvent(label(conflicted(), LABELS.stale, 30), "ReopenedEvent", 1, "maintainer");
    assert.equal(actionFor(pr), "clear");
  });

  it("clears when a maintainer adds on-hold", () => {
    assert.equal(actionFor(label(label(conflicted(), LABELS.stale, 8), LABELS.onHold, 1)), "clear");
  });

  it("does not close for a reason that only started after the warning", () => {
    const pr = label(label(pullRequest(), LABELS.needsChanges, 12), LABELS.stale, 10);
    comment(pr, AUTHOR, 9);
    review(pr, "CHANGES_REQUESTED", 8);
    assert.equal(actionFor(pr), "clear");
  });
});

describe("comments", () => {
  const pr = review(label(pullRequest({ mergeable: "CONFLICTING" }), LABELS.conflicts, 9), "CHANGES_REQUESTED", 8);
  const { turns } = decide(pr, NOW);

  it("tells the author every outstanding reason and how to fix it", () => {
    const body = warningComment(pr, turns, NOW);
    assert.match(body, /@contributor/);
    assert.match(body, /merge conflicts with `main`\. Merging or rebasing/);
    assert.match(body, /from maintainer, hasn't had a reply or a new push/);
    assert.match(body, /closed automatically/);
  });

  it("explains the close and invites a new PR", () => {
    const body = closingComment(pr, turns, NOW);
    assert.match(body, /closed automatically/);
    assert.match(body, /open a new PR/);
    assert.doesNotMatch(body, /keeps it open/);
  });

  it("stays ASCII", () => {
    for (const body of [warningComment(pr, turns, NOW), closingComment(pr, turns, NOW)]) {
      assert.match(body, /^[\x20-\x7E\n]*$/);
    }
  });
});
