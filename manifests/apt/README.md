# APT Repository — Stirling-PDF

This directory contains tooling for maintaining the Stirling-PDF APT/deb repository,
hosted via GitHub Pages.

## Repository Layout (generated)

```
apt-repo/
├── pool/
│   └── main/
│       └── stirling-pdf_<version>_amd64.deb
└── dists/
    └── stable/
        ├── Release
        ├── Release.gpg
        ├── InRelease
        └── main/
            └── binary-amd64/
                ├── Packages
                └── Packages.gz
```

## Files in this directory

| File | Purpose |
|------|---------|
| `update-repo.sh` | Adds a `.deb` file to the repo, regenerates indices, signs with GPG |

## How it works

1. The GitHub Actions workflow (`apt-repo.yml`) triggers on each release.
2. It downloads the `.deb` artifact from the release assets.
3. It checks out the `gh-pages-apt` branch (or initialises it).
4. It runs `update-repo.sh` to place the `.deb` in `pool/main/`, regenerate
   `Packages` / `Packages.gz`, regenerate the `Release` file and sign it.
5. Changes are committed and pushed to `gh-pages-apt`, which is served by
   GitHub Pages at `https://stirling-tools.github.io/Stirling-PDF/`.

## One-time setup (maintainer)

See [docs/distribution/APT.md](../../docs/distribution/APT.md) for the full
setup guide including GPG key generation and secret configuration.
