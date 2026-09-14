# Homepage social previews

The four 1200×630 PNGs are generated from the current editor UI and the actual
ProcessorFlow component. The editor document and processor counts/actions are
fictional marketing examples. They do not change production dashboard data or
enable any product features. The processor card labels the workflow as mock data.

From the repository root, start these in separate terminals:

```sh
task frontend:dev MODE=proprietary PORT=5173
task frontend:storybook -- --ci
```

With Google Chrome installed, run from `frontend/`:

```sh
npx tsx --tsconfig editor/tsconfig.proprietary.vite.json editor/scripts/generate-og-previews.mts
```

The script stubs editor bootstrap APIs, creates a fictional business-review PDF,
and captures the `Portal/Marketing/ProcessorPreview/Enterprise` story. No backend
or customer data is needed. Flow particles are captured in motion, so their
positions can vary between runs. Inspect all four PNGs after regeneration.

Outputs:

- `public/og_images/home.png`: default/self-hosted homepage.
- `public/og_images/saas/app.png`: SaaS `/` and `/app`.
- `public/og_images/saas/app-editor.png`: SaaS `/editor`.
- `public/og_images/saas/app-processor.png`: SaaS `/processor`.

The downloads headline lives in `generate-og-previews.mts`. The processor mock
lives in `ProcessorPreview.stories.tsx`; its compact styling is story-only.
