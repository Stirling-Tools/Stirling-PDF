# CI Configuration

## CI Lite Mode

Skip non-essential CI workflows by setting a repository variable:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

- Name: `CI_PROFILE`
- Value: `lite`

Skips resource-intensive builds, releases, and OSS-specific workflows. Useful for deployment-only forks or faster CI runs.
