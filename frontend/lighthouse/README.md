# Lighthouse budget gate

Audits two routes against a production build and fails when a route's
**transfer weight** or **request count** regresses past its recorded baseline.
Runs on every PR that touches frontend sources.

```bash
task frontend:lighthouse          # build, audit, diff against the baseline
task frontend:lighthouse:record   # re-record the baseline after an intended change
```

## What you get to look at

Three things, each for a different reader:

- **The job summary**, rendered on the workflow run itself. Baseline against
  current for every gated metric, plus the scores and timings. No download.
- **`<route>.html`** in `frontend/.lighthouse-reports/` - Lighthouse's own
  report for the first run of each route. Open it in a browser: filmstrip,
  screenshots, the network waterfall, every audit it ran. This is the one to
  reach for when a number moved and you want to know why.
- **`<route>.run1.json`, `.run2.json`, `.run3.json`** - the raw result of every
  run, and `summary.json`, the normalised numbers the gate reads.

CI uploads the whole directory as the `lighthouse-<run id>` artifact.

## Why the score isn't the gate

A wasm-backed PDF editor will never post a good cold-load performance score, and
a check that is permanently red is a check everyone learns to ignore. The
category scores and the lab timings (FCP, LCP, TBT, CLS, Speed Index) are
reported next to their baseline delta in the job summary, and never fail the
job - on shared CI hardware they move several percent between identical commits.

Bytes and request counts do not. The same `dist` served to the same pinned
Chrome transfers the same bytes every run, so a tolerance-bounded diff catches
the regression that actually costs users something - a heavy import landing in
an eager chunk - without ever crying wolf. Measured over three runs after a
discarded warm-up, the two routes spread 5 bytes and 0 bytes respectively, out
of 6.5 MB and 15.5 MB.

Tolerances live at the top of [`check.mjs`](check.mjs): 2% or 10 KiB (whichever
is larger) on byte counts, +2 on request counts.

## What the audit can and cannot see

No backend runs, so every route behind the auth gate settles on the login
screen and transfers identical bytes (`/compress` and `/settings` came within
10 bytes of `/`). That still covers the whole eager bundle, which downloads
before the login screen paints, and that is where weight regressions land.
It does **not** cover chunks that only load once a user is signed in.

`/mobile-scanner` is the counterweight: it uses no backend, so it renders
fully, and at 15.5 MB it is by far the heaviest route in the build. It is also
the more trustworthy of the two numbers: it came back byte-for-byte identical
between a Windows and a Linux build, 15,889,416 both times.

`/` has a timing-sensitive tail. Whether the login screen's own lazy chunks
(Login, AuthProvider, EmailPasswordForm and friends, about 21 KiB over 7
requests) land inside the audit window depends on how fast the machine is. CI
has been consistent about it - three runs, zero spread - and the baseline is
recorded from CI, so this does not flap today. If `/` ever fails with roughly
+21 KiB and +7 requests and nothing in the diff explains it, that tail is the
first thing to suspect: the bytes stay inside the 2% tolerance but +7 requests
does not.

## The gate went red. Now what?

The failure names the route and the metric, e.g.

```
Cold entry: JavaScript 1394.8 KiB → 1538.2 KiB, +143.4 KiB (+10.3%) - over the 2% / 10.0 KiB tolerance
```

1. Download the artifact and open `<route>.html`. The network waterfall shows
   what grew; the treemap shows which chunk it landed in.
2. If it was accidental - a library pulled into an eager chunk, a `lazy()` that
   stopped being lazy - fix it.
3. If the increase is intended, re-record in the same PR so the review sees the
   number move:

   ```bash
   task frontend:lighthouse:record
   ```

   From a CI failure you can skip the local rebuild: download the
   `lighthouse-<run id>` artifact, drop its `summary.json` into
   `frontend/.lighthouse-reports/`, and run `node lighthouse/check.mjs --record`.

The baseline records the Chrome user-agent it was captured with, and `check.mjs`
prints a note when the current run's platform differs. The same `dist` should
transfer the same bytes wherever it is served from, but if a first CI run comes
back red with that note above it, re-record from the CI artifact rather than
hunting for a regression that is not there.

## Adding a route

Append to [`routes.mjs`](routes.mjs) and re-record. Keep the list short: each
route costs three Lighthouse runs, and a route that renders the same login
screen as `/` adds cost without adding signal - check it actually loads
something different before adding it.
