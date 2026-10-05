import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GitHubClient } from "./github.ts";
import { type ChangedFile, checkPullRequestSize, countedLines, exemption, MAX_LINES, readAllowlist, type SizedPullRequest } from "./pr-size.ts";

const repo = { owner: "o", repo: "r" };

function pullRequest(overrides: Partial<SizedPullRequest> = {}): SizedPullRequest {
  return {
    number: 7,
    additions: 10,
    deletions: 5,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor", type: "User" },
    labels: [],
    ...overrides,
  };
}

const file = (filename: string, additions: number, deletions = 0): ChangedFile => ({ filename, additions, deletions });

function fakeGitHub(files: ChangedFile[]) {
  const pages: number[] = [];
  const github: GitHubClient = {
    graphql: async () => assert.fail("no graphql"),
    rest: {
      issues: {
        createComment: async () => assert.fail("no comments"),
        addLabels: async () => assert.fail("no labels"),
        removeLabel: async () => assert.fail("no labels"),
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
  return { github, pages };
}

async function check(pr: SizedPullRequest, files: ChangedFile[] = [], allowlist: string[] = []) {
  const { github, pages } = fakeGitHub(files);
  const failures: string[] = [];
  const core = { info: () => {}, setFailed: (message: string) => failures.push(message) };
  await checkPullRequestSize({ github, context: { repo, payload: { pull_request: pr } }, core, allowlist });
  return { failures, pages };
}

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

describe("exemption", () => {
  it("exempts the team, bots, the allowlist and approved PRs", () => {
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      assert.notEqual(exemption(pullRequest({ author_association: association }), []), null);
    }
    assert.notEqual(exemption(pullRequest({ user: { login: "dependabot[bot]", type: "Bot" } }), []), null);
    assert.notEqual(exemption(pullRequest({ user: { login: "Contributor", type: "User" } }), ["contributor"]), null);
    assert.notEqual(exemption(pullRequest({ labels: [{ name: "large-pr-approved" }] }), []), null);
  });

  it("holds everyone else to the limit", () => {
    for (const association of ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"]) {
      assert.equal(exemption(pullRequest({ author_association: association, labels: [{ name: "bug" }] }), ["someone-else"]), null);
    }
  });
});

describe("check PR size", () => {
  it("passes a PR within the limit without listing its files", async () => {
    const { failures, pages } = await check(pullRequest({ additions: MAX_LINES, deletions: 0 }));
    assert.deepEqual([failures, pages], [[], []]);
  });

  it("fails a PR over the limit, saying how to get past it", async () => {
    const files = [file("app/core/A.java", 600), file("app/core/B.java", 401)];
    const { failures } = await check(pullRequest({ additions: 1001, deletions: 0 }), files);
    assert.equal(failures.length, 1);
    assert.match(failures[0] ?? "", /changes 1001 lines/);
    assert.match(failures[0] ?? "", /large-pr-approved/);
  });

  it("passes a PR over the limit only because of translations", async () => {
    const files = [file("frontend/editor/public/locales/de-DE/translation.toml", 5000), file("app/core/A.java", 40)];
    const { failures } = await check(pullRequest({ additions: 5040, deletions: 0 }), files);
    assert.deepEqual(failures, []);
  });

  it("reads every page of files", async () => {
    const files = Array.from({ length: 250 }, (_, index) => file(`app/core/F${index}.java`, 5));
    const { failures, pages } = await check(pullRequest({ additions: 1250, deletions: 0 }), files);
    assert.deepEqual(pages, [1, 2, 3]);
    assert.match(failures[0] ?? "", /changes 1250 lines/);
  });

  it("passes an exempt PR however large", async () => {
    const { failures, pages } = await check(pullRequest({ additions: 50000, deletions: 0 }), [], ["contributor"]);
    assert.deepEqual([failures, pages], [[], []]);
  });
});

describe("allowlist", () => {
  it("is a list of logins, lowercased for comparison", async () => {
    for (const login of await readAllowlist()) assert.match(login, /^[a-z0-9-]+$/);
  });
});
