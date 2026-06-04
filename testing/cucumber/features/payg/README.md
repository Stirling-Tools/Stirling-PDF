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

## What's covered (automated, run by `docker-compose-tests-saas.yml` on CI)

| Scenario | Validates |
|---|---|
| First tool call writes a CHARGED row | Filter + interceptor fire end-to-end; shadow row written |
| Lineage join — second call on output | `JobService.joinOrOpen` lineage matching; no new shadow row |
| 4xx leaves the row CHARGED | "customer paid for the attempt" semantics |
| ZIP-returning tool records per-PDF OUTPUT | `PaygOutputExtractor` unpacks + records signatures |
| Multi-file input writes a single shadow row | Multi-input group sizing |
| `X-Stirling-Automation` sets PIPELINE source | Header → `JobSource` detection |

## Manual-only scenarios

Two parts of the shadow engine can't reasonably be driven from this suite
and are verified by hand each time their code paths change. The procedures
live in `notes/PAYG_DESIGN.md` §7.5 "PAYG cucumber: manual-only scenarios".

- **5xx first-step → REFUNDED + CLOSED.** No reliably-5xx-ing tool endpoint
  exists in current Stirling. Engine path is unit-tested in
  `PaygChargeInterceptorTest.afterCompletion_5xx_opened_*`.
- **Kill-switch (`PAYG_FILTER_ENABLED=false`).** Needs a docker-container
  restart mid-suite; orchestrating that in behave is more harness fragility
  than it's worth for a flag that's only flipped during incident response.

## Fixtures

The scenarios reuse `testing/cucumber/exampleFiles/`:
- `ghost1.pdf` — single-page reference PDF
- `tables.pdf` — multi-page input for split / ZIP scenarios

If those filenames change in the main cucumber harness, update
`features/steps/payg_step_definitions.py` SINGLE_PAGE_PDF / THREE_PAGE_PDF
constants to match.
