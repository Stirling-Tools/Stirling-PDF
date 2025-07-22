# JLink Runtime Bundling for Stirling-PDF

This guide explains how to use JLink to bundle a custom Java runtime with your Tauri application, eliminating the need for users to have Java installed.

## Overview

Instead of requiring users to install a JRE separately, JLink creates a minimal, custom Java runtime that includes only the modules your application needs. This approach:

- **Eliminates JRE dependency**: Users don't need Java installed
- **Reduces size**: Only includes necessary Java modules
- **Improves security**: Minimal attack surface with fewer modules
- **Ensures consistency**: Same Java version across all deployments

## Prerequisites

- **JDK 17 or higher** (not just JRE - you need `jlink` command)
- **Node.js and npm** for the frontend
- **Rust and Tauri CLI** for building the desktop app

## Quick Start

### 1. Build with JLink

Run the appropriate build script for your platform:

**Linux/macOS:**
```bash
./scripts/build-tauri-jlink.sh
```

**Windows:**
```cmd
scripts\build-tauri-jlink.bat
```

### 2. Build Tauri Application

```bash
cd frontend
npm run tauri-build
```

The resulting application will include the bundled JRE and won't require Java to be installed on the target system.

## What the Build Script Does

1. **Builds the Stirling-PDF JAR** using Gradle
2. **Analyzes dependencies** using `jdeps` to determine required Java modules
3. **Creates custom JRE** using `jlink` with only necessary modules
4. **Copies files** to the correct Tauri directories:
   - JAR file → `frontend/src-tauri/libs/`
   - Custom JRE → `frontend/src-tauri/runtime/jre/`
5. **Creates test launchers** for standalone testing

## Directory Structure

After running the build script:

```
frontend/src-tauri/
├── libs/
│   └── Stirling-PDF-X.X.X.jar
├── runtime/
│   ├── jre/                    # Custom JLink runtime
│   │   ├── bin/
│   │   │   ├── java(.exe)
│   │   │   └── ...
│   │   ├── lib/
│   │   └── ...
│   ├── launch-stirling.sh      # Test launcher (Linux/macOS)
│   └── launch-stirling.bat     # Test launcher (Windows)
└── tauri.conf.json            # Already configured to bundle runtime
```

## Testing the Bundled Runtime

Before building the full Tauri app, you can test the bundled runtime:

**Linux/macOS:**
```bash
./frontend/src-tauri/runtime/launch-stirling.sh
```

**Windows:**
```cmd
frontend\src-tauri\runtime\launch-stirling.bat
```

This will start Stirling-PDF using the bundled JRE, accessible at http://localhost:8080

## Configuration Details

### Tauri Configuration (`tauri.conf.json`)

The bundle resources are configured to include both the JAR and runtime:

```json
{
  "bundle": {
    "resources": [
      "libs/*.jar",
      "runtime/jre/**/*"
    ]
  }
}
```

### Gradle Configuration (`build.gradle`)

JLink options are configured in the jpackage section:

```gradle
jLinkOptions = [
    "--strip-debug",
    "--compress=2",
    "--no-header-files",
    "--no-man-pages"
]

addModules = [
    "java.base",
    "java.desktop",
    "java.logging",
    "java.management",
    // ... other required modules
]
```

### Rust Code (`lib.rs`)

The application automatically detects and uses the bundled JRE instead of system Java.

## Modules Included

The custom runtime includes these Java modules:

- `java.base` - Core Java functionality
- `java.desktop` - AWT/Swing (for UI components)
- `java.instrument` - Java instrumentation (required by Jetty)
- `java.logging` - Logging framework
- `java.management` - JMX and monitoring
- `java.naming` - JNDI services
- `java.net.http` - HTTP client
- `java.security.jgss` - Security services
- `java.sql` - Database connectivity
- `java.xml` - XML processing
- `java.xml.crypto` - XML security
- `jdk.crypto.ec` - Elliptic curve cryptography
- `jdk.crypto.cryptoki` - PKCS#11 support
- `jdk.unsupported` - Internal APIs (used by some libraries)

## Troubleshooting

### JLink Not Found
```
❌ jlink is not available
```
**Solution**: Install a full JDK (not just JRE). JLink is included with JDK 9+.

### Module Not Found During Runtime
If the application fails with module-related errors, you may need to add additional modules to the `addModules` list in `build.gradle`.

### Large Runtime Size
The bundled runtime should be 50-80MB. If it's much larger:
- Ensure `--strip-debug` and `--compress=2` options are used
- Review the module list - remove unnecessary modules
- Consider using `--no-header-files` and `--no-man-pages`

## Benefits Over Traditional JAR Approach

| Aspect | Traditional JAR | JLink Bundle |
|--------|----------------|--------------|
| User Setup | Requires JRE installation | No Java installation needed |
| Distribution Size | Smaller JAR, but requires ~200MB JRE | Larger bundle (~80MB), but self-contained |
| Java Version | Depends on user's installed version | Consistent, controlled version |
| Security Updates | User manages JRE updates | Developer controls runtime version |
| Startup Time | May be faster (shared JRE) | Slightly slower (isolated runtime) |

## Advanced Usage

### Custom Module Analysis

To analyze your specific JAR's module requirements:

```bash
jdeps --print-module-deps --ignore-missing-deps build/libs/Stirling-PDF-*.jar
```

### Manual JLink Command

If you want to create the runtime manually:

```bash
jlink \
    --add-modules java.base,java.desktop,java.logging,java.management,java.naming,java.net.http,java.security.jgss,java.sql,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported \
    --strip-debug \
    --compress=2 \
    --no-header-files \
    --no-man-pages \
    --output frontend/src-tauri/runtime/jre
```

## Migration Guide

### From JAR-based Tauri App

1. Update your Tauri configuration to include the runtime resources
2. Update your Rust code to use the bundled JRE path
3. Run the JLink build script
4. Test the bundled runtime
5. Build and distribute the new self-contained app

### Deployment

The final Tauri application will be completely self-contained. Users can:
- Install the app normally (no Java installation required)
- Run the app immediately after installation
- Not worry about Java version compatibility issues

## Support

If you encounter issues with the JLink bundling:

1. Ensure you have a JDK (not JRE) installed
2. Check that the Java version is 17 or higher
3. Verify that the build script completed successfully
4. Test the bundled runtime using the provided launcher scripts
5. Check the Tauri build logs for any missing resources