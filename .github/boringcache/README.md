# Optional BoringCache CI caches

The workflows keep their existing GitHub cache configuration as the default.
BoringCache is selected only when all of the following are true:

1. The repository variable `BORINGCACHE_ENABLED` is set to `true`.
2. `BORINGCACHE_RESTORE_TOKEN` is available, or a trusted non-PR run has
   `BORINGCACHE_SAVE_TOKEN` available.

Pull requests are restore-only. Trusted non-PR runs may restore and publish.
Every workflow uses `trust-policy: auto` and pins `boringcache/one` to the
immutable distribution commit for v1.19.2.

The root [`.boringcache.toml`](../../.boringcache.toml) owns portable dependency
caches and the Gradle and sccache adapters. The child configurations in this
directory give each Docker target an independent cache tag, preventing one
image variant from replacing another variant's cache.

When the compile-heavy Docker base changes, its BoringCache-owned build also
persists existing BuildKit cache mounts and enables the dedicated ccache
adapter for Ghostscript, QPDF, and ImageMagick. The Dockerfile keeps this
compiler cache opt-in, so the GitHub-cache fallback does not install or invoke
ccache.

To return to GitHub-hosted caches without changing a workflow, unset
`BORINGCACHE_ENABLED` or set it to any value other than `true`.
