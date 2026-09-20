const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.ARTIFACT_RUN_ID;
const prNumber = process.env.PR_NUMBER;
const headSha = process.env.EXPECTED_HEAD_SHA;
const workflow = process.env.EXPECTED_WORKFLOW || "Cache integration save suite";

if (!repository || !/^\d+$/.test(String(runId)) || !/^\d+$/.test(String(prNumber)) || !headSha) {
  throw new Error("GITHUB_REPOSITORY, ARTIFACT_RUN_ID, PR_NUMBER and EXPECTED_HEAD_SHA are required");
}

const eventPath = path.join(os.tmpdir(), "cache-the-planet-workflow-run.json");
const event = {
  workflow_run: {
    conclusion: "success",
    event: "pull_request",
    name: workflow,
    head_sha: headSha,
    repository: { full_name: repository },
    pull_requests: [{ number: Number(prNumber), head: { sha: headSha } }],
  },
};

fs.writeFileSync(eventPath, JSON.stringify(event));
process.env.GITHUB_EVENT_PATH = eventPath;
process.env.CACHE_CONFIG_FILE = ".cache-the-planet.json";

(async () => {
  try {
    await require(path.resolve(__dirname, "../../cache-the-planet/scripts/publish-pr-cache-artifacts.js")).main();
  } finally {
    fs.rmSync(eventPath, { force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
