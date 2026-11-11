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
  type SizedPullRequest,
} from "./pr-size.ts";

const repo = { owner: "o", repo: "r" };

function pullRequest(overrides: Partial<SizedPullRequest> = {}): SizedPullRequest {
  return {
    number: 7,
    state: "open",
    additions: 10,
    deletions: 5,
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

function fakeGitHub(files: ChangedFile[], comments: Comment[], writers: string[]) {
  const calls: string[] = [];
  const pages: number[] = [];
  const lookups: string[] = [];
  const github: GitHubClient = {
    graphql: async () => assert.fail("no graphql"),
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({ username }) => {
          lookups.push(username);
          return { data: { permission: writers.includes(username) ? "write" : "read" } };
        },
      },
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
  return { github, calls, pages, lookups };
}

async function check(
  pr: SizedPullRequest,
  files: ChangedFile[] = [],
  { comments = [] as Comment[], live = true, writers = [] as string[] } = {},
) {
  const { github, calls, pages, lookups } = fakeGitHub(files, comments, writers);
  const failures: string[] = [];
  const warnings: string[] = [];
  const core = {
    info: () => {},
    warning: (message: string) => warnings.push(message),
    setFailed: (message: string) => failures.push(message),
  };
  await checkPullRequestSize({ github, context: { repo, payload: { pull_request: pr } }, core, live });
  return { failures, warnings, calls, pages, comments, lookups };
}

const TOO_LARGE = [{ name: "too-large" }];

describe("counted lines", () => {
  it("counts additions and deletions", () => {
    assert.equal(countedLines([file("app/core/A.java", 30, 20), file("frontend/src/b.ts", 5)]), 55);
  });

  it("leaves out translations and lockfiles", () => {
    const files = [
      file("frontend/public/locales/fr-FR/translation.toml", 900),
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
  const canPush = (writers: string[]) => async (login: string) => writers.includes(login);

  it("never limits anyone who can push, or bots", async () => {
    assert.notEqual(await authorExemption(pullRequest(), canPush(["contributor"])), null);
    assert.notEqual(await authorExemption(pullRequest({ user: { login: "dependabot[bot]", type: "Bot" } }), canPush([])), null);
  });

  it("lifts the limit for approved PRs", () => {
    assert.notEqual(approval(pullRequest({ labels: [{ name: "large-pr-approved" }] })), null);
  });

  it("holds everyone else to the limit", async () => {
    const pr = pullRequest({ labels: [{ name: "bug" }] });
    assert.deepEqual([await authorExemption(pr, canPush(["someone-else"])), approval(pr)], [null, null]);
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

  it("only warns until live: no failure, comment or label", async () => {
    const { failures, warnings, calls } = await check(oversized(1200), codeFiles(1200), { live: false });
    assert.deepEqual([failures, calls], [[], []]);
    assert.match(warnings[0] ?? "", /Not enforced yet: .*changes 1200 lines/);
  });

  it("passes a PR over the limit only because of translations", async () => {
    const files = [file("frontend/public/locales/de-DE/translation.toml", 5000), file("app/core/A.java", 40)];
    assert.deepEqual((await check(oversized(5040), files)).failures, []);
  });

  it("reads every page of files", async () => {
    const files = Array.from({ length: 250 }, (_, index) => file(`app/core/F${index}.java`, 5));
    const { failures, pages } = await check(oversized(1250), files);
    assert.deepEqual(pages, [1, 2, 3]);
    assert.match(failures[0] ?? "", /changes 1250 lines/);
  });

  it("takes too-large off a PR whose author can push", async () => {
    const { calls } = await check(pullRequest({ additions: 50000, labels: TOO_LARGE }), [], { writers: ["contributor"] });
    assert.deepEqual(calls, ["list comments", "unlabel too-large"]);
  });

  it("leaves anyone who can push, bots and closed PRs alone", async () => {
    for (const [pr, writers] of [
      [pullRequest({ additions: 50000 }), ["contributor"]],
      [pullRequest({ additions: 50000, user: { login: "dependabot[bot]", type: "Bot" } }), []],
      [pullRequest({ additions: 50000, state: "closed" }), []],
    ] as const) {
      const { failures, calls, pages } = await check(pr, codeFiles(50000), { writers: [...writers] });
      assert.deepEqual([failures, calls, pages], [[], [], []]);
    }
  });

  it("asks GitHub who can push only for a PR over the limit", async () => {
    assert.deepEqual((await check(pullRequest())).lookups, []);
    assert.deepEqual((await check(oversized(1200), codeFiles(1200))).lookups, ["contributor"]);
  });
});
