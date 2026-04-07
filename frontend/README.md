# Frontend
## Environment Variables

The frontend requires environment variables to be set before running. `npm run dev` will create a `.env` file for you automatically on first run using the defaults from `config/.env.example` - for most development work this is all you need.

If you need to configure specific services (Google Drive, Supabase, Stripe, PostHog), edit your local `.env` file. The values in `config/.env.example` show what each variable does and provides sensible defaults where applicable.

For desktop (Tauri) development, `npm run tauri-dev` will additionally create a `.env.desktop` file from `config/.env.desktop.example`.

## Docker Setup

For Docker deployments and configuration, see the [Docker README](../docker/README.md).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)


## Tauri

All desktop tasks are available via [Task](https://taskfile.dev). From the root of the repo:

### Dev

```bash
task desktop:dev
```

This ensures the JLink runtime and backend JAR exist (skipping if already built), then starts Tauri in dev mode.

### Build

```bash
task desktop:build
```

This does a full clean rebuild of the backend JAR and JLink runtime, then builds the Tauri app for production.

Platform-specific dev builds are also available:

```bash
task desktop:build:dev           # No bundling
task desktop:build:dev:mac       # macOS .app bundle
task desktop:build:dev:windows   # Windows NSIS installer
task desktop:build:dev:linux     # Linux AppImage
```

### JLink Tasks

You can also run JLink steps individually:

```bash
task desktop:jlink          # Build JAR + create JLink runtime + test
task desktop:jlink:jar      # Build backend JAR only
task desktop:jlink:runtime  # Create JLink custom JRE only
task desktop:jlink:test     # Verify the bundled JRE works
task desktop:jlink:clean    # Remove JLink artifacts
```

### Clean

```bash
task desktop:clean
```

Removes all desktop build artifacts including JLink runtime, bundled JARs, Cargo build, and dist/build directories.

> [!NOTE]
>
> Desktop builds require additional environment variables. See [Environment Variables](#environment-variables)
> above - `task desktop:dev` will set these up automatically from `config/.env.desktop.example` on first run.
