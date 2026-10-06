import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GitHubClient } from "./github.ts";
import {
  approval,
  authorExemption,
  type ChangedFile,
  checkPullRequestSize,
  countedLines,
  liftedComment,
  MAX_LINES,
  oversizedComment,
  readAllowlist,
  type SizedPullRequest,
} from "./pr-size.ts";

const repo = { owner: "o", repo: "r" };

function pullRequest(overrides: Partial<SizedPullRequest> = {}): SizedPullRequest {
  return {
    number: 7,
    state: "open",
    additions: 10,
    deletions: 5,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor", type: "User" },
    labels: [],
    ...overrides,
  };
}

const file = (filename: string, additions: number, deletions = 0): ChangedFile => ({ filename, additions, deletions });
const oversized = (additions: number, labels: { name: string }[] = []) => pullRequest({ additions, deletions: 0, labels });
const codeFiles = (lines: number) => [file("app/core/A.java", lines)];

interface Comment {
  id: number;
  body?: string;
  user: { login: string; type: string } | null;
}

const BOT = { login: "github-actions[bot]", type: "Bot" };

function fakeGitHub(files: ChangedFile[], comments: Comment[]) {
  const calls: string[] = [];
  const pages: number[] = [];
  const github: GitHubClient = {
    graphql: async () => assert.fail("no graphql"),
    rest: {
      issues: {
        createComment: async ({ body }) => {
          calls.push("comment");
          comments.push({ id: comments.length + 1, body, user: BOT });
        },
        addLabels: async ({ labels }) => calls.push(`label ${labels.join(",")}`),
        removeLabel: async ({ name }) => calls.push(`unlabel ${name}`),
        listComments: async ({ page, per_page }) => {
          calls.push("list comments");
          return { data: comments.slice((page - 1) * per_page, page * per_page) };
        },
        updateComment: async ({ comment_id, body }) => {
          calls.push(`edit ${comment_id}`);
          const comment = comments.find((candidate) => candidate.id === comment_id);
          assert.ok(comment);
          comment.body = body;
        },
      },
      pulls: {
        get: async () => assert.fail("no reads"),
        update: async () => assert.fail("no closes"),
        listFiles: async ({ page, per_page }) => {
          pages.push(page);
          return { data: files.slice((page - 1) * per_page, page * per_page) };
        },
      },
    },
  };
  return { github, calls, pages };
}

async function check(
  pr: SizedPullRequest,
  files: ChangedFile[] = [],
  { allowlist = [] as string[], comments = [] as Comment[], live = true } = {},
) {
  const { github, calls, pages } = fakeGitHub(files, comments);
  const failures: string[] = [];
  const core = { info: () => {}, setFailed: (message: string) => failures.push(message) };
  await checkPullRequestSize({ github, context: { repo, payload: { pull_request: pr } }, core, allowlist, live });
  return { failures, calls, pages, comments };
}

const TOO_LARGE = [{ name: "too-large" }];

describe("counted lines", () => {
  it("counts additions and deletions", () => {
    assert.equal(countedLines([file("app/core/A.java", 30, 20), file("frontend/editor/src/b.ts", 5)]), 55);
  });

  it("leaves out translations and lockfiles", () => {
    const files = [
      file("frontend/editor/public/locales/fr-FR/translation.toml", 900),
      file("app/core/src/main/resources/messages_fr_FR.properties", 900),
      file("frontend/package-lock.json", 900),
      file("engine/uv.lock", 900),
      file("app/core/gradle.lockfile", 900),
      file("app/core/A.java", 1),
    ];
    assert.equal(countedLines(files), 1);
  });
});

describe("exemptions", () => {
  it("never limits the team or bots", () => {
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      assert.notEqual(authorExemption(pullRequest({ author_association: association })), null);
    }
    assert.notEqual(authorExemption(pullRequest({ user: { login: "dependabot[bot]", type: "Bot" } })), null);
  });

  it("lifts the limit for the allowlist and approved PRs", () => {
    assert.notEqual(approval(pullRequest({ user: { login: "Contributor", type: "User" } }), ["contributor"]), null);
    assert.notEqual(approval(pullRequest({ labels: [{ name: "large-pr-approved" }] }), []), null);
  });

  it("holds everyone else to the limit", () => {
    for (const association of ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"]) {
      const pr = pullRequest({ author_association: association, labels: [{ name: "bug" }] });
      assert.deepEqual([authorExemption(pr), approval(pr, ["someone-else"])], [null, null]);
    }
  });
});

describe("check PR size", () => {
  it("passes a PR within the limit without listing its files", async () => {
    const { failures, pages } = await check(pullRequest({ additions: MAX_LINES, deletions: 0 }));
    assert.deepEqual([failures, pages], [[], []]);
  });

  it("fails a PR over the limit, tells the author how to get past it and labels it", async () => {
    const files = [file("app/core/A.java", 600), file("app/core/B.java", 401)];
    const { failures, calls, comments } = await check(oversized(1001), files);
    assert.equal(failures.length, 1);
    assert.deepEqual(calls, ["list comments", "comment", "label too-large"]);
    assert.match(comments[0]?.body ?? "", /@contributor, this PR has been marked as too large because it changes 1001 lines/);
    assert.match(comments[0]?.body ?? "", /add a comment explaining why/);
    assert.match(comments[0]?.body ?? "", /closed automatically/);
  });

  it("comments once, and edits that comment when the size changes", async () => {
    const comments = [{ id: 1, body: oversizedComment("contributor", 1200), user: BOT }];
    assert.deepEqual((await check(oversized(1200, TOO_LARGE), codeFiles(1200), { comments })).calls, ["list comments"]);
    const { calls } = await check(oversized(1500, TOO_LARGE), codeFiles(1500), { comments });
    assert.deepEqual(calls, ["list comments", "edit 1"]);
    assert.match(comments[0]?.body ?? "", /changes 1500 lines/);
  });

  it("does not take someone else's copy of the comment for its own", async () => {
    const comments = [{ id: 1, body: oversizedComment("contributor", 1200), user: { login: "contributor", type: "User" } }];
    assert.deepEqual((await check(oversized(1200, TOO_LARGE), codeFiles(1200), { comments })).calls, ["list comments", "comment"]);
  });

  it("says when a warned PR is split down or approved, and unlabels it", async () => {
    const split = [{ id: 1, body: oversizedComment("contributor", 1200), user: BOT }];
    const { calls } = await check(oversized(1200, TOO_LARGE), codeFiles(900), { comments: split });
    assert.deepEqual(calls, ["list comments", "edit 1", "unlabel too-large"]);
    assert.equal(split[0]?.body, liftedComment("it now changes 900 lines"));

    const approved = [{ id: 1, body: oversizedComment("contributor", 1200), user: BOT }];
    const labels = [...TOO_LARGE, { name: "large-pr-approved" }];
    const { failures } = await check(oversized(1200, labels), codeFiles(1200), { comments: approved });
    assert.deepEqual(failures, []);
    assert.match(approved[0]?.body ?? "", /no longer marked as too large, because it is labelled `large-pr-approved`/);
  });

  it("leaves a PR it never warned alone", async () => {
    const { calls } = await check(oversized(1200, [{ name: "large-pr-approved" }]), codeFiles(1200));
    assert.deepEqual(calls, []);
  });

  it("fails the check but neither comments nor labels unless live", async () => {
    const { failures, calls } = await check(oversized(1200), codeFiles(1200), { live: false });
    assert.match(failures[0] ?? "", /changes 1200 lines/);
    assert.deepEqual(calls, []);
  });

  it("passes a PR over the limit only because of translations", async () => {
    const files = [file("frontend/editor/public/locales/de-DE/translation.toml", 5000), file("app/core/A.java", 40)];
    assert.deepEqual((await check(oversized(5040), files)).failures, []);
  });

  it("reads every page of files", async () => {
    const files = Array.from({ length: 250 }, (_, index) => file(`app/core/F${index}.java`, 5));
    const { failures, pages } = await check(oversized(1250), files);
    assert.deepEqual(pages, [1, 2, 3]);
    assert.match(failures[0] ?? "", /changes 1250 lines/);
  });

  it("takes too-large off a PR whose author is exempt", async () => {
    const { calls } = await check(pullRequest({ additions: 50000, author_association: "MEMBER", labels: TOO_LARGE }));
    assert.deepEqual(calls, ["unlabel too-large"]);
  });

  it("leaves the team, bots and closed PRs alone", async () => {
    for (const pr of [
      pullRequest({ additions: 50000, author_association: "MEMBER" }),
      pullRequest({ additions: 50000, user: { login: "dependabot[bot]", type: "Bot" } }),
      pullRequest({ additions: 50000, state: "closed" }),
    ]) {
      const { failures, calls, pages } = await check(pr, codeFiles(50000));
      assert.deepEqual([failures, calls, pages], [[], [], []]);
    }
  });
});

describe("allowlist", () => {
  it("is a list of logins, lowercased for comparison", async () => {
    for (const login of await readAllowlist()) assert.match(login, /^[a-z0-9-]+$/);
  });
});
