# Enterprise SaaS SAML lab

This lab runs Keycloak as a real SAML identity provider and drives the SaaS application's company-login page through Supabase. It uses the backend from this PR and the companion Supabase migration from SaaS PR #351. It does not use the self-hosted Java SAML integration, fake JWTs, mocked browser requests or an authentication bypass.

The local container is only the identity provider. The application runs locally against a **disposable hosted Supabase test project or PR preview**. This preserves the application's HTTPS and JWT validation requirements and exercises the deployed Supabase Auth behavior. The script does not create a hosted project, apply database migrations, change billing or deploy edge functions.

## Start the identity provider

Requirements: Node 22+, Docker with Compose v2, the repository frontend dependencies, and Playwright Chromium. From the repository root:

```sh
task e2e:company-sso:up
task e2e:install -- chromium
```

`up` initializes `.test-state/enterprise-sso/` once and starts Keycloak on <http://localhost:18080>. It creates `owner` and `employee` users with generated passwords. Open `config.json` in that ignored directory for the user password and `lab-admin` password. The owner uses `owner@enterprise-sso.example.com`; the employee uses `employee@enterprise-sso.example.com`. These do not send email. Keycloak data and signing keys persist across `down`/`up`.

To initialize the files without starting Docker:

```sh
node testing/enterprise-sso/lab.mjs init
```

## Prepare the test SaaS project

1. Use an isolated Supabase project or the companion PR's preview. Apply the complete SaaS schema and `20261007160000_company_sso.sql`; deploy the companion functions according to [the deployment notes](../../docs/developer/ENTERPRISE_SSO.md). Do not use the minimal SQL unit-test fixture as an application database.
2. Enable SAML in Supabase Authentication providers. Allow `http://localhost:5173/company-sso**` as a redirect URL for this local test; use the actual app origin/base path if different. Keep email/password sign-in available for original-account proof. Use an asymmetric project signing key supported by the application's JWT decoder.
3. Fill `app/.env.saas.local` with this project's `SAAS_DEV_PROJECT_REF`, `SAAS_DEV_PUBLISHABLE_KEY`, `SAAS_DEV_DB_PASSWORD` and any required DB URL/username. Add `APP_COMPANYSSO_ENABLED=true` and `APP_COMPANYSSO_SERVICEROLEKEY=<test project's service-role key>` there (Spring removes hyphens when mapping these property names to environment variables). The secret belongs only in the backend environment, never in a Vite variable or the browser test configuration.
4. Start `task dev:saas`. It may choose free ports: copy the actual app and backend URLs into the lab configuration. Create an ordinary password account, create a disposable company team, and activate its Enterprise trial through the normal UI. Record its numeric team ID. The account must be a team leader. An account email different from the Keycloak owner's email exercises explicit conversion without email matching.
5. Edit `.test-state/enterprise-sso/config.json`: set `disposable` to `true`, `projectRef`, `supabaseUrl`, `publishableKey`, `appUrl`, `apiUrl`, `expectedTeamId`, and the ordinary leader's `email`/`password`. Keep `idp` as `keycloak`. No service-role key is needed by the harness.

The configuration is intentionally incomplete after initialization: no default points at the shared staging or production project. It and all generated credentials, metadata, checkpoints and results are gitignored. Do not commit or upload that directory.

## Configure and run

```sh
task e2e:company-sso:configure
task e2e:company-sso:doctor
task e2e:company-sso:test -- --headed
```

`configure` fetches the real Supabase SP metadata, configures a Keycloak SAML client with its exact Entity ID, ACS and signing certificate, and saves `idp.xml`. The IdP signs its responses/assertions and verifies signed requests. Metadata XML is uploaded directly, so the hosted Supabase service does not need to fetch a localhost URL; the browser follows the local IdP redirect. Run the browser on the same machine as the IdP.

`doctor` checks live metadata against the settings returned by Stirling, authenticates the ordinary leader, checks the expected team/role and Enterprise eligibility, and verifies the local metadata file exists. It does not save or activate SSO. It cannot verify that the server-only service-role credential is correct until provider registration runs.

`test` **saves and activates SSO on the configured test team**. Activation remains in place so you can explore the UI afterward. The suite:

1. Saves the draft provider through the real settings API.
2. Opens the company-login UI, proves the existing owner's password, follows the real SAML browser redirect and confirms conversion.
3. Checks the original local user ID, leadership, team and canonical Supabase billing UUID are preserved while the SAML auth UUID is separate.
4. Activates SSO and verifies the ordinary password session receives `COMPANY_SSO_REQUIRED`.
5. Signs in the employee, proves its unadmitted session cannot access the app, then confirms admission to the expected team as Member.
6. Verifies that leaving is rejected without changing membership.
7. Refreshes the employee session, removes it as the leader, and rejects both old tokens and a new refresh after removal.
8. Performs a fresh SAML login, checks rejoining as Member, and verifies the old session is still rejected.

No tokens, assertions, passwords, screenshots, videos, browser storage dumps or traces are included in the report. `result.json` contains only pass/fail steps, time and test identifiers. Console failure messages identify the stage; inspect the test environment when diagnosing a failure, keeping credentials out of shared logs.

The suite can be rerun against its own active connection using `checkpoint.json`. It refuses an unrelated active connection. Keep the checkpoint together with the IdP data and project. The employee ends as a Member; future runs remove and rejoin that same test employee. Do not assign real employees to the lab realm. A new test project can be used for a clean first-time setup run.

## Manual UI walkthrough

After `configure`, you can run the same stories manually: open **Settings → Company single sign-on**, upload `.test-state/enterprise-sso/idp.xml`, select **Test and connect my account**, and sign in to Keycloak as `owner`. Enable SSO and use a private browser window with the company link to sign in as `employee`. The generated password is in `config.json`. Use the [intended customer guide](../../docs/developer/enterprise-sso-user-guide.md) to check the wording and navigation.

For Entra, set `idp` to `entra`, configure a **test enterprise application** with the Entity ID/ACS from Supabase, assign distinct owner and employee test accounts, and download its federation metadata. Set `entraMetadataPath` to that file's absolute path, then run `configure`, `doctor` and `test`. The browser opens visibly and waits up to five minutes at each company-login step for you to complete Entra sign-in/MFA. It never asks for or stores an Entra password. The ordinary Stirling owner still uses password proof. Use a fresh test project/team when switching providers; an active connection cannot be overwritten.

## Additional release acceptance

The automated suite does not claim coverage of every hosted integration. Use the same team to check Enterprise expiry/renewal, a second existing member's conversion, wrong-provider denial, invitations/self-removal, multiple tabs, account avatars, Data API/Storage/billing restrictions and actual MCP-client login/refresh/PDF dispatch. Expiry should block new joins and rejoining while preserving existing members' SSO. Entra application assignment and MFA must also be tested on Entra; a Keycloak run is not evidence of those policies.

Stop the IdP with `task e2e:company-sso:down`. This preserves its data and does not remove hosted accounts or turn off SSO. Restart it to regain access to the test company. Dispose of the dedicated Supabase project only when you no longer need the environment. `task e2e:company-sso:logs` reads the local IdP's recent logs.

## Harness checks

```sh
task e2e:company-sso:check
```

These offline checks cover targeting guards, metadata validation, SAML provider assertions, HTTP redirect refusal and form encoding. They are separate from the live test; passing them does not mean a SAML login succeeded.

References: [Supabase SAML](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml), [Auth SAML routes](https://github.com/supabase/auth/blob/v2.196.0/internal/api/api.go), [Keycloak container configuration](https://www.keycloak.org/server/containers).
