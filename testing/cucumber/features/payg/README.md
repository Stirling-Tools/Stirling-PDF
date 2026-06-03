# PAYG cucumber scenarios

End-to-end coverage for the PAYG shadow charging engine (PR #6519 / PR-S3
in `notes/PAYG_DESIGN.md` §7.5).

## Running locally

```bash
./testing/test-payg.sh
```

That script:
1. Boots `testing/compose/docker-compose-saas.yml` (Stirling-PDF with
   `STIRLING_FLAVOR=saas` + a Postgres holding the `stirling_pdf` schema)
2. Waits for backend health
3. Pipes `testing/compose/payg/saas-seed.sql` into the test postgres,
   creating a `payg-cucumber-team` flipped to `wallet_policy.engine =
   'PAYG_SHADOW'` and a test user with API key `payg-cucumber-key`
4. Runs `python -m behave features/payg`
5. Tears the stack down

## What's covered

| Scenario | Validates |
|---|---|
| First tool call writes a CHARGED row | Filter + interceptor fire end-to-end; shadow row written |
| Lineage join — second call on output | `JobService.joinOrOpen` lineage matching; no new shadow row |
| 5xx first-step failure → REFUNDED + CLOSED | `markFirstStepFailed` shadow + process lifecycle |
| 4xx leaves the row CHARGED | "customer paid for the attempt" semantics |
| ZIP-returning tool records per-PDF OUTPUT | `PaygOutputExtractor` unpacks + records signatures |
| Multi-file input writes a single shadow row | Multi-input group sizing |
| `X-Stirling-Automation` sets PIPELINE source | Header → `JobSource` detection |
| `payg.filter.enabled = false` writes 0 rows | Kill-switch |

## What still needs work before this is CI-ready

This PR lands the scaffolding. A few things still need to slot together
before the saas-cucumber job goes green in CI:

1. **The "filter-toggle restart" step is `NotImplementedError`.** The
   scenario that exercises `payg.filter.enabled = false` needs a harness
   hook that flips the env var on the running container and waits for
   re-health. The Postgres seed approach used by every other scenario
   doesn't apply here — it's a Spring property. Two options for the
   follow-up: (a) a docker-compose override that the harness `up -d`'s
   over the base, or (b) two separate compose runs of the same suite.
2. **Test user seed timing.** `saas-seed.sql` inserts into
   `stirling_pdf.users` / `team_memberships` after Flyway has run, but
   the JPA entity for the legacy `User` table may have additional NOT
   NULL columns the seed doesn't populate. Run once locally and adjust.
3. **API-key auth path under saas profile.** The compose disables the
   OAuth2 resource-server auto-config so the Supabase JWT filter no-ops,
   but the legacy `SECURITY_CUSTOMGLOBALAPIKEY` filter may not be wired
   under the saas profile by default. May need a small profile-conditional
   `@Configuration` to ensure API-key auth works in saas-test mode.
4. **CI job.** `.github/workflows/docker-compose-tests-saas.yml` (new)
   should be modelled after the existing `docker-compose-tests.yml` but
   call `test-payg.sh` instead of `test.sh`. Wired in once the local
   harness is reliably green.

The Gherkin scenarios are the contract. Treat them as the agreed test
surface; the items above are infrastructure to get those scenarios passing
in CI rather than scope changes.

## Fixtures

The scenarios reuse `testing/cucumber/exampleFiles/`:
- `ghost1.pdf` — single-page reference PDF
- `tables.pdf` — multi-page input for split / ZIP scenarios

If those filenames change in the main cucumber harness, update
`features/steps/payg_step_definitions.py` SINGLE_PAGE_PDF / THREE_PAGE_PDF
constants to match.
