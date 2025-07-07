# Tauri Build Workflows

This directory contains GitHub Actions workflows for building Tauri desktop applications for Stirling-PDF.

## Workflows

### 1. `tauri-build.yml` - Production Build Workflow

**Purpose**: Build Tauri applications for all platforms (Windows, macOS, Linux) and optionally create releases.

**Triggers**:
- Manual dispatch with options for test mode and platform selection
- Pull requests affecting Tauri-related files
- Pushes to main branch affecting Tauri-related files

**Platforms**:
- **Windows**: x86_64 (exe and msi)
- **macOS**: Apple Silicon (aarch64) and Intel (x86_64) (dmg)
- **Linux**: x86_64 (deb and AppImage)

**Features**:
- Builds Java backend first
- Installs all dependencies
- Creates signed artifacts (if signing keys are configured)
- Validates all artifacts are created successfully
- Can create GitHub releases (when not in test mode)

### 2. `tauri-test.yml` - Test Workflow

**Purpose**: Test Tauri builds without creating releases - perfect for validating changes.

**Triggers**:
- Manual dispatch with platform selection
- Pull requests affecting Tauri-related files

**Features**:
- Allows testing specific platforms or all platforms
- Validates build artifacts are created
- Checks artifact sizes
- Reports results without creating releases

## Usage

### Testing Before Merge

1. **Test All Platforms**:
   ```bash
   # Go to Actions tab in GitHub
   # Run "Test Tauri Build" workflow
   # Select "all" for platform
   ```

2. **Test Specific Platform**:
   ```bash
   # Go to Actions tab in GitHub  
   # Run "Test Tauri Build" workflow
   # Select specific platform (windows/macos/linux)
   ```

### Production Builds

1. **Test Mode** (recommended for PRs):
   ```bash
   # Go to Actions tab in GitHub
   # Run "Build Tauri Applications" workflow
   # Set test_mode: true
   ```

2. **Release Mode**:
   ```bash
   # Go to Actions tab in GitHub
   # Run "Build Tauri Applications" workflow  
   # Set test_mode: false
   # This will create a GitHub release
   ```

## Configuration

### Required Secrets (Optional)

For signed builds, configure these secrets in your repository:

- `TAURI_SIGNING_PRIVATE_KEY`: Private key for signing Tauri applications
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the signing private key

### File Structure

The workflows expect this structure:
```
├── frontend/
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/
│   ├── package.json
│   └── src/
├── gradlew
└── stirling-pdf/
    └── build/libs/
```

## Validation

Both workflows include comprehensive validation:

1. **Build Validation**: Ensures all expected artifacts are created
2. **Size Validation**: Checks artifacts aren't suspiciously small
3. **Platform Validation**: Verifies platform-specific requirements
4. **Integration Testing**: Tests that Java backend builds correctly

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: 
   - Ubuntu: Ensure system dependencies are installed
   - macOS: Check Rust toolchain targets
   - Windows: Verify MSVC tools are available

2. **Java Backend Build Fails**:
   - Check Gradle permissions (`chmod +x ./gradlew`)
   - Verify JDK 21 is properly configured

3. **Artifact Size Issues**:
   - Small artifacts usually indicate build failures
   - Check that backend JAR is properly copied to Tauri resources

4. **Signing Issues**:
   - Ensure signing secrets are configured if needed
   - Check that signing keys are valid

### Debugging

1. **Check Logs**: Each step provides detailed logging
2. **Artifact Inspection**: Download artifacts to verify contents
3. **Local Testing**: Test builds locally before running workflows

## Integration with Existing Workflows

These workflows are designed to complement the existing build system:

- Uses same JDK and Gradle setup as `build.yml`
- Follows same security practices as `multiOSReleases.yml`
- Compatible with existing release processes

## Next Steps

1. Test the workflows on your branch
2. Verify all platforms build successfully
3. Check artifact quality and sizes
4. Configure signing if needed
5. Merge when all tests pass