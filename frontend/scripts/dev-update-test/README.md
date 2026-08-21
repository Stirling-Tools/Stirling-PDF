# Auto-Update Testing

## One command (automated)

```bash
# First time only:
npm run tauri:setup-dev-update

# Run tests (builds JRE + JAR + signed bundle, starts server + app, runs checks):
npm run tauri:test-update-e2e

# Full install test (downloads + installs the update):
npm run tauri:test-update-e2e:install

# Skip rebuild if bundle already exists:
bash scripts/dev-update-test/test-update-e2e.sh --skip-build
```

## Manual testing

```bash
# Terminal 1 - serve the signed v99.0.0 update:
npm run tauri:serve-dev-update

# Terminal 2 - run the app at v0.0.1:
npm run tauri:dev-with-update
```

Go to Settings > General > Software Updates. Click "Check for Updates" then "Install Now".

## Requires

- Java 21+ JDK (with `jlink`)
- Node.js, Python 3 (with `pip install websockets`)
- First-time setup generates signing keys + config override
