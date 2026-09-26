const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const repository = process.env.GITHUB_REPOSITORY;
const prNumber = String(process.env.PR_NUMBER || "");
const artifactRoot = process.env.PR_CACHE_ARTIFACTS_DIR;
const publisherRoot = process.cwd();

if (!repository || !/^\d+$/.test(prNumber) || !artifactRoot) {
  throw new Error("GITHUB_REPOSITORY, PR_NUMBER and PR_CACHE_ARTIFACTS_DIR are required");
}

if (
  !process.env.CACHE_SFTP_HOST ||
  !process.env.CACHE_SFTP_USERNAME ||
  (!process.env.CACHE_SFTP_PRIVATE_KEY && !process.env.CACHE_SFTP_PASSWORD)
) {
  throw new Error("CACHE_SFTP_HOST, CACHE_SFTP_USERNAME and SFTP credentials are required");
}

const prefix = `cache-the-planet-pr-${prNumber}-`;
const pattern = new RegExp(`^cache-the-planet-pr-${prNumber}-([A-Za-z0-9_-]{1,32})-([0-9a-f]{8,128})-v([1-9]\\d*)$`, "i");
const artifacts = fs
  .readdirSync(artifactRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
  .map((entry) => {
    const match = entry.name.match(pattern);
    if (!match) throw new Error(`invalid PR cache artifact name: ${entry.name}`);
    return { directory: path.join(artifactRoot, entry.name), cacheName: match[1], key: match[2], version: match[3] };
  });

if (artifacts.length > 16) throw new Error("too many PR cache artifacts");

const headSha = process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA;
const eventPath = path.join(process.env.RUNNER_TEMP || artifactRoot, "cache-pr-event.json");
fs.writeFileSync(
  eventPath,
  JSON.stringify({
    repository: { full_name: repository, default_branch: "main" },
    pull_request: {
      number: Number(prNumber),
      head: { sha: headSha, repo: { full_name: repository } },
      base: { repo: { full_name: repository } },
    },
  }),
);

try {
  for (const artifact of artifacts) {
    const stagingRoot = path.join(publisherRoot, ".cache", artifact.cacheName);
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(stagingRoot), { recursive: true });
    fs.cpSync(artifact.directory, stagingRoot, { recursive: true });
    try {
      cp.execFileSync(process.execPath, [path.join(publisherRoot, "dist", "save.js")], {
        cwd: publisherRoot,
        env: {
          ...process.env,
          CACHE_CONFIG_FILE: "",
          CACHE_STORAGE: "sftp",
          INPUT_STORAGE: "sftp",
          SFTP_HOST: process.env.CACHE_SFTP_HOST,
          SFTP_PORT: process.env.CACHE_SFTP_PORT || "22",
          SFTP_USERNAME: process.env.CACHE_SFTP_USERNAME,
          SFTP_PRIVATE_KEY: process.env.CACHE_SFTP_PRIVATE_KEY,
          SFTP_PASSWORD: process.env.CACHE_SFTP_PASSWORD,
          SFTP_BASE_PATH: process.env.CACHE_SFTP_BASE_PATH || "/cache-the-planet",
          CACHE_ALLOWED_CACHE_NAMES: artifacts.map((item) => item.cacheName).join(","),
          GITHUB_WORKSPACE: publisherRoot,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: repository,
          GITHUB_SHA: headSha,
          GITHUB_REF: `refs/pull/${prNumber}/merge`,
          GITHUB_REF_TYPE: "branch",
          INPUT_REPOSITORY: repository,
          "INPUT_CACHE-NAME": artifact.cacheName,
          INPUT_SCOPE: "untrusted",
          "INPUT_ALLOW-PR-CACHE": "true",
          INPUT_KEY: artifact.key,
          INPUT_VERSION: artifact.version,
          INPUT_PATH: `.cache/${artifact.cacheName}`,
          INPUT_STRICT: "false",
        },
        stdio: "inherit",
      });
    } finally {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
  }
} finally {
  fs.rmSync(eventPath, { force: true });
}
