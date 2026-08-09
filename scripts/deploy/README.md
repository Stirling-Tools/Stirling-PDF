# Preview deployment tooling

Scripts shared by the two VPS deployment workflows:

| Workflow | Deploys | Port | Directory |
|---|---|---|---|
| `PR-Auto-Deploy-V2.yml` | every approved PR | the PR number | `/stirling/V2-PR-<n>` |
| `Main-Auto-Deploy.yml` | `main` | `900` | `/stirling/V2-MAIN` |

Port `900` is chosen to sit permanently below every PR number - PR previews
publish on their bare number and those only climb, so the demo can never
collide with one. `901`+ is free for any other static service.

## Enterprise mode

Both workflows set `PREMIUM_ENABLED=true` and pass
`PREMIUM_KEY=${{ secrets.PREMIUM_KEY_ENTERPRISE }}` - the same enterprise key
the enterprise Playwright suite (`build-enterprise.yml`) already runs on. No
extra secret to create.

When the secret is unavailable - fork PRs, where GitHub does not expose
secrets - the deployment still goes out at the free tier rather than booting
with a blank key. The PR comment and the main deploy's job summary both say
which happened.

`ENTERPRISE` rather than `SERVER` tier matters here: the audit dashboard,
fleet usage and portal analytics endpoints are `@EnterpriseEndpoint`, and a
`SERVER` licence (`metadata.users = 0`) does not unlock them.

### Seats

`metadata.users` on the licence is what becomes `premium.maxUsers`, and for an
ENTERPRISE licence that number *replaces* the grandfathered limit rather than
adding to it. It needs to stay comfortably above the seed databases' user
counts (16 in `main-demo`), otherwise creating further users through the UI
hits the seat cap.

### Machine activations

A plain licence key is validated **online** against `api.keygen.sh` at boot,
so every preview container registers a machine against the licence. Two
consequences worth knowing:

* The licence must be **floating with a high `maxMachines`**. When a floating
  licence is full, `KeygenLicenseVerifier.activateMachine` deregisters the
  *oldest* machine to make room - so a fleet of previews on a small licence
  would continuously evict each other.
* Machines accumulate. A destroyed preview container does not deregister
  itself, so stale fingerprints build up in the Keygen account over time and
  want an occasional clear-out.

There is also a boot-time dependency: `LicenseKeyChecker.init()` runs the
validation from `@PostConstruct` with no try/catch, and `verifyStandardLicense`
throws after 5 failed attempts. A Keygen outage therefore fails the Spring
context and the container will not start. (The 7-day periodic re-check *is*
guarded and only logs.) An offline licence file - `PREMIUM_KEY=file:/path.crt`,
checked out as `base64+ed25519` - avoids all of the above if that ever becomes
a problem.

## Scripts

* **`stage-seed-database.sh`** - runs on the GitHub runner; stops the previous
  container and copies the seed database into place before `docker-compose up`.
  Seeding is optional and skipped quietly when the file is absent.

Stopping the container first is load-bearing, not tidiness: a running app holds
the H2 file open and flushes its own state on shutdown, so replacing the file
underneath it would lose the seed.

The PR workflow deliberately runs `stage-seed-database.sh` from a sparse
checkout of `main`, not from the PR branch: that step has the VPS SSH key in
scope, and PR branches cut before the script landed would not have it at all.
It is checked out *after* the image build because the Dockerfile does
`COPY . .`, so an earlier checkout would bake it into the image and invalidate
the layer cache every deploy. The seed database *is* taken from the PR branch,
so a PR that changes the fixture can be exercised in its own preview.
