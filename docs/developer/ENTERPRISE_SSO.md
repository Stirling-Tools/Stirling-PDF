# Enterprise company SSO — draft implementation

This draft implements self-service SAML setup for enterprise SaaS teams, including Microsoft Entra ID. It requires the companion `Stirling-PDF-SaaS` migration `20261007160000_company_sso.sql` and edge-function changes. It is not a production rollout or a claim that a live Entra tenant has been tested.

## User stories and surfaces

| User story | Surface and intended result |
| --- | --- |
| A leader creates an ordinary account, then configures SSO | Settings → Company single sign-on. Copy the Entity ID and ACS URL into Entra, upload metadata XML, save a draft. Enterprise entitlement is assigned by Stirling; customers cannot grant it to themselves. |
| The leader tests before enforcing SSO | Test and connect my account opens an isolated sign-in ceremony. Prove the existing account and sign in through the configured SAML provider. Preserve the local user ID, leader membership and original billing identity. |
| The leader makes company sign-in mandatory | The leader who tested the current metadata revision acknowledges the change and selects Require company SSO. Ordinary sign-ins and human API keys then fail company access checks. |
| A new employee joins | Open the company link, authenticate with its assigned SAML application, confirm, then enter the mapped team as a Member. Admission and seat consumption commit together. No personal team is created during this ceremony. |
| An existing team member converts | Choose Connect an existing team account. Prove both identities; email similarity alone never links accounts. Existing ownership, role and billing references remain unchanged. |
| An employee uses ordinary login after activation | Editor and portal API responses send them to company sign-in. Ordinary authentication remains usable only as proof during the explicit conversion ceremony. |
| A leader removes a member | Users explains that the leader must also remove IdP application access. Removal invalidates admitted sessions through the membership ID. A later fresh company login may rejoin as a Member. |
| An employee tries to leave | Leave is hidden; leave and self-removal APIs reject the action. Invitations cannot move managed accounts out of the company. Managed account self-deletion is rejected by the edge function. |
| A company needs certificate maintenance or recovery | Contact support. Active metadata cannot be overwritten or SSO disabled by the self-service screen in this MVP. |

Only the SaaS web application has the sign-in ceremony. Desktop company login, directory sync, group-based roles, SCIM, IdP-initiated login without a browser attempt, multiple connections per team and self-service active-provider rotation are outside this draft.

## Identity and session contract

Supabase SAML accounts are separate from ordinary accounts, even when their emails match. The application stores a binding from the company auth UUID to the existing local user. The existing `users.supabase_auth_id` remains the canonical billing and ownership UUID. New employees use their company auth UUID as their canonical identity.

Configuration and conversion require primary authentication within five minutes; token refresh or MFA alone does not renew that proof. Browser attempts expire after ten minutes, are stored as SHA-256 hashes, bind the connection revision and optional original account, and are consumed once. A returned SAML session must contain the exact provider UUID in signed `amr`, with a fresh SAML authentication timestamp. The server scans all AMR entries, including when MFA is first.

The browser holds company and original credentials in separate tab-scoped clients. It installs the company session as the normal application session only after explicit server admission. Callback retries share a single authorization-code exchange. Neither `app_metadata.provider`, email domains, query parameters nor a list of linked identities authorizes a company session.

Each admitted Supabase `session_id` is recorded against a specific membership ID. Removing that membership immediately removes access on subsequent requests. A refresh or old session cannot recreate it, including after rejoining. These records are consumed-login receipts, not a revoked-user list. A new successful SAML authentication may rejoin when seats are available; the IdP is the authority for future eligibility. Receipt retention must outlast the maximum possible Supabase session lifetime; do not prune them while their sessions could still refresh.

Java resolves the canonical user before provisioning or authorizing requests. Supabase's PostgREST pre-request hook validates admission and maps the transaction's subject to the canonical UUID for existing RPCs and RLS. The signed token itself is unchanged. Storage has separate restrictive admission and canonical avatar policies because PostgREST hooks do not cover Storage. Already-issued signed download URLs remain valid until their expiry; membership removal blocks new authenticated access, not previously issued URLs or downloaded files. Billing edge functions call a user-scoped admission RPC before service-role queries. This repository has no company Realtime integration: any future Realtime publication must enforce equivalent RLS rather than relying on the pre-request hook.

## OAuth2 / OIDC findings (7 October 2026)

Supabase supports custom OAuth2 and OIDC providers. The same settings, conversion and team-admission experience is feasible, but the secure backend is not the same as SAML:

| Question | Finding |
| --- | --- |
| Can Supabase register a custom provider? | Yes. Its custom-provider admin interface supports OAuth2 and OIDC configuration. OAuth2 alone is not a standardized identity assertion; prefer OIDC for enterprise authentication. |
| Does the resulting session identify the provider used? | Current Auth source adds the provider UUID to SAML AMR. OAuth AMR records `oauth` without equivalent per-session provider evidence. Account metadata and linked identities cannot fill this gap. |
| Could server-owned PKCE establish the provider? | Potentially. Auth's internal `auth.flow_state` records provider type, user and PKCE challenge before exchange. A server-owned verifier plus an atomic, verified exchange could bind a session. This is an internal schema dependency, not a documented hosted integration contract. It is not implemented here. |
| Is custom-provider email linking isolated by company? | The source defaults OAuth providers to a shared email-linking domain. An arbitrary customer issuer must not be allowed to claim another customer's email and obtain its account before our conversion checks run. |
| Is there a Supabase isolation mechanism? | Auth source has experimental `ProviderLinkingDomains` configuration. No documented hosted Management API or custom-provider field was found to configure that isolation. Hosted availability remains unconfirmed. |

Consequently, this draft enables SAML only. Before enabling arbitrary enterprise OIDC, establish provider-isolated account linking on the actual hosted project, a supported way to prove the provider for each admitted session, and tests for cross-tenant email assertions, code replay, refresh, removal and original-account preservation. A generic Microsoft social-login button does not establish these company boundaries.

Primary references:

- [Supabase custom OAuth2/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase SAML SSO](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Auth session/AMR source](https://github.com/supabase/auth/blob/master/internal/models/sessions.go)
- [Auth linking-domain source](https://github.com/supabase/auth/blob/master/internal/models/linking.go)
- [Auth experimental configuration](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go)
- [Auth flow state](https://github.com/supabase/auth/blob/master/internal/models/flow_state.go) and [PKCE exchange](https://github.com/supabase/auth/blob/master/internal/api/token.go)
- [Hosted Auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
- [Data API protection and hook scope](https://supabase.com/docs/guides/api/securing-your-api)

Source-level findings are observations of current code, not promises of a stable Supabase API.

## Deployment and review

1. Apply the companion migration **before deploying this backend**, even while setup is disabled: enforcement queries the tables on ordinary authenticated requests. The migration refuses to replace a different PostgREST pre-request hook; compose existing policy explicitly if present. Preserve its grants and search-path restrictions.
2. Deploy the companion billing/procurement/deletion edge functions. Shared dependency changes require redeploying every function that imports them. Follow the companion deployment note.
3. Enable SAML on the Supabase project, configure allowed `/company-sso` redirect URLs for the actual application origin/base path, and keep default social/email sign-in available for conversion proof. The email template used for existing-account verification must include `{{ .Token }}` so users can enter a code in the same tab.
4. Supply a server-only Supabase service-role credential and eligible enterprise team IDs. Never expose it through `VITE_*`. Optional discovery domains must be verified by the operator before adding them. Without discovery, the company link still works.
5. Configure ingress rate limits for `/api/v1/company-sso/discover`, `/start`, `/complete` and provider administration. Public start creates a ten-minute attempt; upstream Supabase limits alone do not bound application database writes. Keep request bodies and bearer credentials out of request logging.
6. Run the staging acceptance cases below, then enable only the pilot team.

Example Spring configuration (the secret is supplied by the deployment environment):

```yaml
app:
  company-sso:
    enabled: true
    service-role-key: ${SUPABASE_SERVICE_ROLE_KEY}
    eligible-team-ids: [123]
    verified-domains:
      "[example.com]": 123
```

Turning `enabled` off prevents setup and new ceremonies; it deliberately does not remove an active team's enforcement. Recovery requires an operator to verify the customer and restore a usable connection or explicitly change its policy. Do not use the feature flag as an emergency bypass.

Staging acceptance must use a real Entra application: save metadata, test the original leader, activate, convert another existing member, admit a new Member, reject a different provider, exercise MFA-first AMR, fill the seat cap, remove a member, reject old and refreshed sessions across Java/Data API/Storage/billing, then prove that fresh rejoining does not restore leadership. Verify wallets, ownership, profile images and team resources retain their original owner IDs. Repeat with two browser sessions and expired/cancelled callbacks. None of those live-provider checks were performed locally.

Local validation covers the SaaS backend suite, frontend checks and regression tests, PostgreSQL admission/Storage assertions and edge-function authentication checks. The repository-wide backend gate also runs unrelated operating-system tests; local Windows path/process and symlink failures are recorded in the draft PR rather than treated as a passing gate.

The documentation-site draft is [Enterprise SSO user guide](enterprise-sso-user-guide.md).
