# SaaS dev deployment secrets

`Saas-Dev-Deploy.yml` deploys a SaaS-mode server on every push to `main`
(frontend `901`, backend `902`, AI engine internal-only). Every SaaS credential
comes from the **`saas-dev` GitHub Environment**, so the secret names match the
container env vars exactly - there is no `SAAS_DEV_` prefix to keep in sync.

Repo settings -> Environments -> `saas-dev` -> Environment secrets.

If any required secret is missing the job logs a warning and skips: a half
configured SaaS backend boot-loops on its datasource rather than failing
usefully, so no deploy is better than a broken one.

## Required

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `SAAS_DB_PROJECT_REF` | Dev Supabase project ref (the `<ref>` in `<ref>.supabase.co`) | Supabase -> Project Settings -> General |
| `SAAS_DB_URL` | JDBC URL for that project's Postgres, e.g. `jdbc:postgresql://db.<ref>.supabase.co:5432/postgres` | built from the ref |
| `SAAS_DB_PASSWORD` | Postgres password | Supabase -> Project Settings -> Database |
| `SAAS_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...`, baked into the browser bundle at build time. Frontend-only - the backend never reads it under the `saas` profile - but the frontend is deployed, so it is required | Supabase -> Project Settings -> API |

Not secrets, so not stored: the Supabase URL and the PAYG meter endpoint are
derived from `SAAS_DB_PROJECT_REF` the same way the app derives them.

## Optional

| Secret | Effect when set | Effect when absent |
| --- | --- | --- |
| `SUPABASE_EDGE_FUNCTION_SECRET` | Backend -> edge function calls work (team invites, PAYG meter) | app boots fine; invites error, metering no-ops with a WARN |
| `ANTHROPIC_API_KEY` | AI engine is built, deployed, and wired to the backend | deploy skips the engine; AI features are off |
| `VOYAGE_API_KEY` | RAG embeddings work (`voyageai:voyage-4`) | engine runs, RAG search fails |
| `SAAS_DB_USERNAME` | overrides the DB user | defaults to `postgres` |
| `KEYGEN_ACCOUNT_ID` + `KEYGEN_API_TOKEN` + `KEYGEN_POLICY_ID` | real enterprise licences via Keygen (all three needed) | mock licence service |

## Already at repo level

`NEW_VPS_SSH_KEY`, `NEW_VPS_USERNAME`, `NEW_VPS_HOST` - shared with the PR
previews and the main demo. Environment secrets override repo secrets of the
same name, so adding a `saas-dev` copy is how you point this deploy at a
different host without touching the others.

No registry credential is needed: images go to
`ghcr.io/<owner>/stirling-pdf-test` authenticated with the job's `GITHUB_TOKEN`,
per #7435.

## Pointing at a different project

Everything project-specific is in the environment, so a second target (staging,
a throwaway Supabase branch) is a second environment plus a one-line change to
`environment:` in the workflow.

## Schema

The workflow deploys against an existing Supabase project, it does not create
one. Schema comes from the Supabase migrations in the SaaS repo; the Java side
only reconciles its own entity tables (`ddl-auto=update`) inside the
`stirling_pdf` schema.
