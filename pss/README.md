# PSS PDF

PDF editor for the RMI Public School System, built from the **MIT-licensed core** of
[Stirling PDF](https://github.com/Stirling-Tools/Stirling-PDF). Staff use it to upload PDFs,
add/delete/reorder pages, sign, edit and add text, and redact.

## What is (and is not) in this branch

`pss/main` contains no code under the Stirling PDF User License. The folders listed in
[`pruned-paths.txt`](pruned-paths.txt) (proprietary, SaaS, cloud, desktop, processor/portal and
the AI engine) are deleted, along with upstream's GitHub workflows. The build only accepts the
`core` flavor: Gradle refuses any other `STIRLING_FLAVOR`, and Vite defaults to `core`.

`scripts/pss-license-guard.sh` fails CI if any pruned path, upstream workflow, or file containing
the "Stirling PDF User License" text appears. It runs on every push and PR to `pss/main`.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Untouched mirror of upstream. Use GitHub's **Sync fork** here only. Never deployed. |
| `pss/main` | The PSS app. Deployed. Never press Sync fork on it. |

## Pulling in upstream fixes

```bash
git checkout pss/main && git pull
git checkout -b sync/$(date +%Y-%m-%d)
scripts/pss-sync.sh            # merges origin/main, re-prunes, runs the guard
git commit -m "Sync upstream main into PSS"
git push -u origin HEAD        # open a PR into pss/main; CI re-checks
```

Upstream edits to files we deleted show up as modify/delete conflicts; the sync script resolves
them by keeping the files deleted. Any other conflict stops the script for a manual fix.

## Run it

```bash
docker compose -f docker/pss/docker-compose.yml up -d --build
```

The container listens on `127.0.0.1:8090` only. It has no login of its own, so expose it
solely through nginx behind the PSS Google sign-in (`pss.edu.mh` accounts).

## Branding

- Accent colours: `--p-pss-*` in `frontend/src/editor/core/theme/primitives.css`, mapped in
  `colors.css`.
- App name: `UI_APPNAMENAVBAR` in the compose file.
- Logo: the Stirling marks in `frontend/src/editor/core/assets/brand/` still need replacing
  with the PSS logo. The MIT license does not grant rights to the Stirling PDF name or logo.

## Development notes

Upstream's `Taskfile.yml` still lists engine/proprietary/desktop tasks; those fail here. Use the
core variants (`task frontend:typecheck:core`, `task frontend:build:core`) or the commands in
`.github/workflows/pss-ci.yml`.
