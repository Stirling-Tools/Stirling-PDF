// Stale PR triage, run daily by .github/workflows/stale-prs.yml.
//
// Works out whether each open PR is waiting on its author. When it has been the
// author's turn for too long it posts a warning, and closes the PR a week later if
// the same thing is still outstanding. A PR that is waiting on maintainers (no
// review yet, or the author has replied since) is never warned or closed.
//
// The warning's date is the time the Stale PR label was added, so removing that
// label cancels a warning and "on-hold" exempts a PR permanently.

const DAY_MS = 24 * 60 * 60 * 1000;

export const LABELS = {
  stale: "Stale PR",
  onHold: "on-hold",
  needsChanges: "needs-changes",
  conflicts: "has conflicts", // must match CONFLICT_LABEL in pr-conflict-labeler.yml
};

export const WARN_AFTER_DAYS = {
  conflicts: 7,
  review: 7,
  needsChanges: 7,
  idleDraft: 30,
};

export const CLOSE_AFTER_WARNING_DAYS = 7;

const CORE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const REVIEW_VERDICTS = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);
const AUTHOR_TIMELINE_EVENTS = new Set(["ReadyForReviewEvent", "ConvertToDraftEvent"]);

export const PULL_REQUESTS_QUERY = `
  query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          url
          isDraft
          mergeable
          baseRefName
          createdAt
          author { login __typename }
          labels(first: 50) { nodes { name } }
          commits(last: 1) { nodes { commit { committedDate } } }
          reviews(last: 50) { nodes { state submittedAt authorAssociation author { login __typename } } }
          comments(last: 50) { nodes { createdAt author { login } } }
          timelineItems(last: 100, itemTypes: [LABELED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
            nodes {
              __typename
              ... on LabeledEvent { createdAt label { name } }
              ... on ReopenedEvent { createdAt }
              ... on ReadyForReviewEvent { createdAt actor { login } }
              ... on ConvertToDraftEvent { createdAt actor { login } }
            }
          }
        }
      }
    }
  }
`;

const time = (iso) => Date.parse(iso);
const days = (ms) => Math.floor(ms / DAY_MS);
const latest = (times) => (times.length === 0 ? null : Math.max(...times));

function hasLabel(pr, name) {
  return pr.labels.nodes.some((label) => label.name === name);
}

function latestLabelTime(pr, name) {
  return latest(
    pr.timelineItems.nodes
      .filter((event) => event.__typename === "LabeledEvent" && event.label?.name === name)
      .map((event) => time(event.createdAt)),
  );
}

function latestReopenTime(pr) {
  return latest(
    pr.timelineItems.nodes.filter((event) => event.__typename === "ReopenedEvent").map((event) => time(event.createdAt)),
  );
}

// Only the author's own actions count. updatedAt is useless here: label changes,
// CI comments and this bot all bump it.
function lastAuthorActivity(pr) {
  const author = pr.author?.login;
  const isAuthor = (actor) => author !== undefined && actor?.login === author;
  return latest([
    time(pr.createdAt),
    ...pr.commits.nodes.map((node) => time(node.commit.committedDate)),
    ...pr.comments.nodes.filter((comment) => isAuthor(comment.author)).map((comment) => time(comment.createdAt)),
    ...pr.reviews.nodes
      .filter((review) => review.submittedAt && isAuthor(review.author))
      .map((review) => time(review.submittedAt)),
    ...pr.timelineItems.nodes
      .filter((event) => AUTHOR_TIMELINE_EVENTS.has(event.__typename) && isAuthor(event.actor))
      .map((event) => time(event.createdAt)),
  ]);
}

// The label's timestamp is when the conflict started. `mergeable` is often UNKNOWN
// while GitHub recomputes it, so it only overrides the label when the conflict is gone.
function conflictTurn(pr) {
  if (pr.isDraft || pr.mergeable === "MERGEABLE" || !hasLabel(pr, LABELS.conflicts)) return null;
  const since = latestLabelTime(pr, LABELS.conflicts);
  return since === null ? null : { kind: "conflicts", since };
}

function isCoreReview(review, prAuthor) {
  return (
    review.submittedAt &&
    review.author &&
    review.author.__typename !== "Bot" &&
    review.author.login !== prAuthor &&
    CORE_ASSOCIATIONS.has(review.authorAssociation) &&
    REVIEW_VERDICTS.has(review.state)
  );
}

function reviewTurn(pr, authorActivity) {
  if (pr.isDraft) return null;
  const review = pr.reviews.nodes
    .filter((candidate) => isCoreReview(candidate, pr.author?.login))
    .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))
    .at(-1);
  if (!review || review.state === "APPROVED") return null;
  const since = time(review.submittedAt);
  return since > authorActivity ? { kind: "review", since, reviewer: review.author.login } : null;
}

function needsChangesTurn(pr, authorActivity) {
  if (!hasLabel(pr, LABELS.needsChanges)) return null;
  const since = latestLabelTime(pr, LABELS.needsChanges);
  return since !== null && since > authorActivity ? { kind: "needsChanges", since } : null;
}

function idleDraftTurn(pr, authorActivity) {
  return pr.isDraft ? { kind: "idleDraft", since: authorActivity } : null;
}

/**
 * Every reason the PR is currently waiting on its author, each with `since`: the
 * epoch ms when that became the author's turn. Empty when it is waiting on maintainers.
 */
export function authorTurns(pr) {
  const authorActivity = lastAuthorActivity(pr);
  return [
    conflictTurn(pr),
    reviewTurn(pr, authorActivity),
    needsChangesTurn(pr, authorActivity),
    idleDraftTurn(pr, authorActivity),
  ].filter(Boolean);
}

/**
 * What to do with one PR at epoch ms `now`. `action` is one of:
 * - "none": nothing outstanding, or not outstanding long enough to warn.
 * - "warn": post the warning listing `turns` and add the Stale PR label.
 * - "pending": warned, and `turns` are still outstanding, but the week is not up.
 * - "close": warned a week ago and `turns` are still outstanding.
 * - "clear": warned, but resolved, reopened or exempted since; remove the label.
 */
export function decide(pr, now) {
  const warned = hasLabel(pr, LABELS.stale);
  if (pr.author?.__typename === "Bot" || hasLabel(pr, LABELS.onHold)) {
    return { action: warned ? "clear" : "none", turns: [] };
  }

  const turns = authorTurns(pr);
  if (!warned) {
    const due = turns.some((turn) => now - turn.since >= WARN_AFTER_DAYS[turn.kind] * DAY_MS);
    return { action: due ? "warn" : "none", turns };
  }

  // A label older than the fetched timeline counts as just added: the close waits,
  // rather than firing on a warning whose date is unknown.
  const warnedAt = latestLabelTime(pr, LABELS.stale) ?? now;
  // A turn that started after the warning means someone acted on it, so the
  // warning no longer describes it.
  const warnedTurns = turns.filter((turn) => turn.since <= warnedAt);
  if (warnedTurns.length === 0 || latestReopenTime(pr) > warnedAt) {
    return { action: "clear", turns };
  }
  const closeDue = now - warnedAt >= CLOSE_AFTER_WARNING_DAYS * DAY_MS;
  return { action: closeDue ? "close" : "pending", turns: warnedTurns };
}

function problem(turn, pr, now) {
  switch (turn.kind) {
    case "conflicts":
      return `It has merge conflicts with \`${pr.baseRefName}\`.`;
    case "review":
      return `The latest review, from ${turn.reviewer}, hasn't had a reply or a new push since.`;
    case "needsChanges":
      return "A maintainer has marked it as waiting on a response from you.";
    case "idleDraft":
      return `It has been a draft with no activity for ${days(now - turn.since)} days.`;
  }
  throw new Error(`Unknown turn kind: ${turn.kind}`);
}

function remedy(turn, pr) {
  switch (turn.kind) {
    case "conflicts":
      return `Merging or rebasing onto \`${pr.baseRefName}\` resolves them.`;
    case "review":
    case "needsChanges":
      return "A reply or a new push keeps it open.";
    case "idleDraft":
      return "A push, a reply or marking it ready for review keeps it open.";
  }
  throw new Error(`Unknown turn kind: ${turn.kind}`);
}

export function warningComment(pr, turns, now) {
  return [
    `Hi @${pr.author.login}, this PR looks stale because it's waiting on you:`,
    "",
    ...turns.map((turn) => `- ${problem(turn, pr, now)} ${remedy(turn, pr)}`),
    "",
    `If this is still outstanding in ${CLOSE_AFTER_WARNING_DAYS} days, the PR will be closed automatically.`,
    "If you think it's actually waiting on us rather than you, say so here and a maintainer will take a look.",
  ].join("\n");
}

export function closingComment(pr, turns, now) {
  return [
    `Hi @${pr.author.login}, this PR has been closed automatically because it was still waiting on you ${CLOSE_AFTER_WARNING_DAYS} days after the reminder:`,
    "",
    ...turns.map((turn) => `- ${problem(turn, pr, now)}`),
    "",
    "Thanks for the contribution! If you pick this up again, please fix the above and open a new PR.",
  ].join("\n");
}

async function fetchOpenPullRequests(github, { owner, repo }) {
  const pullRequests = [];
  let cursor = null;
  do {
    const { repository } = await github.graphql(PULL_REQUESTS_QUERY, { owner, repo, cursor });
    pullRequests.push(...repository.pullRequests.nodes);
    cursor = repository.pullRequests.pageInfo.hasNextPage ? repository.pullRequests.pageInfo.endCursor : null;
  } while (cursor);
  return pullRequests;
}

// Comment before labelling, and before closing: if the second call fails, the next
// run repeats a comment rather than closing a PR whose author was never told.
async function apply(github, repo, pr, { action, turns }, now) {
  const issue = { ...repo, issue_number: pr.number };
  switch (action) {
    case "warn":
      await github.rest.issues.createComment({ ...issue, body: warningComment(pr, turns, now) });
      await github.rest.issues.addLabels({ ...issue, labels: [LABELS.stale] });
      break;
    case "close":
      await github.rest.issues.createComment({ ...issue, body: closingComment(pr, turns, now) });
      await github.rest.pulls.update({ ...repo, pull_number: pr.number, state: "closed" });
      break;
    case "clear":
      await github.rest.issues.removeLabel({ ...issue, name: LABELS.stale });
      break;
  }
}

const ACTION_ORDER = ["close", "warn", "clear", "pending"];

const SUMMARY_KIND_NAMES = {
  conflicts: "with conflicts",
  review: "with an unanswered review",
  needsChanges: "marked needs-changes",
  idleDraft: "drafts",
};

async function writeSummary(core, results, live, now) {
  const rows = results
    .filter(({ decision }) => decision.action !== "none")
    .sort((a, b) => ACTION_ORDER.indexOf(a.decision.action) - ACTION_ORDER.indexOf(b.decision.action))
    .map(({ pr, decision }) => [
      `<a href="${pr.url}">#${pr.number}</a>`,
      pr.author?.login ?? "ghost",
      decision.action,
      decision.turns.map((turn) => `${turn.kind} ${days(now - turn.since)}d`).join(", "),
    ]);
  const waitingOnAuthor = Object.entries(SUMMARY_KIND_NAMES).map(([kind, name]) => {
    const count = results.filter(({ decision }) => decision.turns.some((turn) => turn.kind === kind)).length;
    return `${count} ${name}`;
  });

  await core.summary
    .addHeading(live ? "Stale PR triage" : "Stale PR triage (dry run: no PRs changed)")
    .addRaw(`${results.length} open PRs. Waiting on the author: ${waitingOnAuthor.join(", ")}.`, true)
    .addTable([
      [
        { data: "PR", header: true },
        { data: "Author", header: true },
        { data: "Action", header: true },
        { data: "Waiting on author for", header: true },
      ],
      ...rows,
    ])
    .write();
}

export default async function triageStalePullRequests({ github, context, core, live }) {
  const now = Date.now();
  const results = [];
  let failures = 0;

  for (const pr of await fetchOpenPullRequests(github, context.repo)) {
    const decision = decide(pr, now);
    results.push({ pr, decision });
    if (decision.action === "none") continue;

    core.info(`#${pr.number}: ${decision.action} (${decision.turns.map((turn) => turn.kind).join(", ")})`);
    if (!live) continue;
    try {
      await apply(github, context.repo, pr, decision, now);
    } catch (error) {
      failures += 1;
      core.error(`#${pr.number}: ${decision.action} failed: ${error.message}`);
    }
  }

  await writeSummary(core, results, live, now);
  if (failures > 0) core.setFailed(`${failures} PR(s) could not be updated.`);
}
