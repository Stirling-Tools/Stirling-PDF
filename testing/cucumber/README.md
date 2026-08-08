# Cucumber (behave) API suite

Hits the REST API at `http://localhost:8080` with `X-API-KEY: 123456789`. Run it
from this directory, not from `features/`:

```bash
python -m behave
```

The server must have login **and** storage enabled or the `@folders` scenarios
fail rather than skip. `docker/embedded/compose/test_cicd.yml` is the reference
configuration (`SECURITY_ENABLELOGIN=true`, `STORAGE_ENABLED=true`).

## What runs where

| Run | Command | Contents |
|-----|---------|----------|
| Pull request | `python -m behave` | Everything except `@nightly` and `@manual`. Each PDF endpoint also runs 5x concurrently. |
| Nightly | `python -m behave --tags=@nightly` | Heavy LibreOffice / Calibre / Ghostscript conversions. |
| Nightly | `CUCUMBER_PARALLEL=10 python -m behave` | Every endpoint at high concurrency, including the heavy ones the PR run throttles. |
| Nightly | `./run-parallel.sh 10` | The suite as 10 concurrent shards. |
| Enterprise | `python -m behave features/enterprise` | Licence-gated, run from `build-enterprise.yml`. |
| Multinode | `python -m behave features/multinode` | Needs the clustered stack in `testing/compose/`. |

`behave.ini` excludes `~@manual` and `~@nightly` by default. The nightly job in
`.github/workflows/nightly.yml` opts back in with `--tags=@nightly`.

### Validating the nightly job before it is nightly

A workflow that only runs at 2am is a workflow whose breakage is found at 2am, so
`nightly.yml` also carries a narrow `pull_request` paths trigger covering itself,
`behave.ini`, `run-parallel.sh`, `convert_nightly.feature` and
`parallel_support.py`. A change to any of those is exercised by the pull request
that makes it. The long sweeps (Playwright, a11y, Tauri) are gated to the cron and
to dispatches against `main`, so a pull request only pays for `cucumber-nightly`.

The router in `build.yml` cannot own this the usual way: calling `nightly.yml` via
`workflow_call` would make its `concurrency:` group resolve to the caller's and
self-cancel, the trap documented in `build-enterprise.yml`.

To run it on demand against a branch, which also skips the long sweeps:

```bash
gh workflow run nightly.yml --ref your-branch
```

Locally, the job's three steps are just these, against the compose stack in
`docker/embedded/compose/test_cicd.yml`:

```bash
python -m behave --tags=@nightly
CUCUMBER_PARALLEL=10 CUCUMBER_PARALLEL_DECOY=1 python -m behave
./run-parallel.sh 10
```

Fork pull requests skip `cucumber-nightly`: the image build needs `MAVEN_*`
secrets, which GitHub does not expose to forks.

## Deciding PR vs nightly

Put a scenario behind `@nightly` when it shells out to a heavy external binary
(LibreOffice, Calibre, Ghostscript, OCR) or otherwise takes more than a second or
two. Everything else belongs in the PR run: the whole suite is around a minute and
that is worth protecting.

## Which feature file

| Area | File |
|------|------|
| `/api/v1/general/*` page operations | `general.feature`, `general_new.feature` |
| `/api/v1/misc/*` | `misc_new.feature` |
| `/api/v1/security/*` | `security_new.feature` |
| `/api/v1/form/*` | `forms.feature`, `form_advanced.feature` |
| `/api/v1/filter/*` | `filter.feature` |
| `/api/v1/analysis/*` | `analysis.feature` |
| `/api/v1/convert/*` (fast) | `convert_new.feature` |
| `/api/v1/convert/*` (heavy) | `convert_nightly.feature` |
| `/api/v1/config`, `/info`, `/ui-data`, `/settings` | `info_config.feature` |
| Async job lifecycle (`?async=true`) | `async_jobs.feature` |
| Attachments | `attachments.feature` |
| Bookmarks and chapters | `bookmarks_chapters.feature` |
| Folders and stored files | `folders_and_files.feature` |
| Auth, users, admin | `jwt_auth.feature`, `user_management.feature`, `admin_settings.feature` |

Conversions stay in `convert_new.feature` even when they need an external binary;
`external.feature` is not a required home for those.

## Adding a new endpoint

1. Pick the file from the table above, or add one if the area is genuinely new.
2. Tag the tool (`@rotate-pdf`) and the direction (`@positive` / `@negative`).
3. Add `And this operation is run 5 times in parallel` after the send step unless
   the endpoint is heavy or stateful. See [CONCURRENCY.md](CONCURRENCY.md).
4. Verify the real contract first. Several endpoints in this suite were written
   against a guessed contract and had to be corrected: `DELETE /job/{id}` is a
   cancel that 400s once the job is finished, an unowned job id gives 403 rather
   than 404, and `form/extract-csv` takes its upload as `file`, not `fileInput`.

To find endpoints that still have no coverage, compare the controller mappings
against the paths used in `features/`. Note that tool endpoints are declared with
`@AutoJobPostMapping` and inherit their base path from meta-annotations such as
`@GeneralApi`, so a naive grep for `@PostMapping` misses most of them.
