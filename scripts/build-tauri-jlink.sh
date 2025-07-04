#!/bin/bash

# Build script for Tauri with JLink runtime bundling
# This script creates a self-contained Java runtime for Stirling-PDF

set -e

echo "🔧 Building Stirling-PDF with JLink runtime for Tauri..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Java is installed and version
print_step "Checking Java environment..."
if ! command -v java &> /dev/null; then
    print_error "Java is not installed or not in PATH"
    exit 1
fi

if ! command -v jlink &> /dev/null; then
    print_error "jlink is not available. Please ensure you have a JDK (not just JRE) installed."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    print_error "Java 17 or higher is required. Found Java $JAVA_VERSION"
    exit 1
fi

print_success "Java $JAVA_VERSION detected with jlink support"

# Check if jpackage is available (Java 14+)
if command -v jpackage &> /dev/null; then
    print_success "jpackage is available for native packaging"
else
    print_warning "jpackage is not available - using jlink only"
fi

# Clean and build the Stirling-PDF JAR
print_step "Building Stirling-PDF JAR..."
./gradlew clean bootJar --no-daemon

if [ ! -f "stirling-pdf/build/libs/Stirling-PDF-"*.jar ]; then
    print_error "Failed to build Stirling-PDF JAR"
    exit 1
fi

# Find the built JAR
STIRLING_JAR=$(ls stirling-pdf/build/libs/Stirling-PDF-*.jar | head -n 1)
print_success "Built JAR: $STIRLING_JAR"

# Create directories for Tauri
TAURI_SRC_DIR="frontend/src-tauri"
TAURI_LIBS_DIR="$TAURI_SRC_DIR/libs"
TAURI_RUNTIME_DIR="$TAURI_SRC_DIR/runtime"

print_step "Creating Tauri directories..."
mkdir -p "$TAURI_LIBS_DIR"
mkdir -p "$TAURI_RUNTIME_DIR"

# Copy the JAR to Tauri libs directory
print_step "Copying JAR to Tauri libs directory..."
cp "$STIRLING_JAR" "$TAURI_LIBS_DIR/"
print_success "JAR copied to $TAURI_LIBS_DIR/"

# Create a custom JRE using jlink
print_step "Creating custom JRE with jlink..."

# Determine modules needed by analyzing the JAR
print_step "Analyzing JAR dependencies..."

# Use jdeps to analyze module dependencies if available
if command -v jdeps &> /dev/null; then
    print_step "Running jdeps analysis..."
    REQUIRED_MODULES=$(jdeps --print-module-deps --ignore-missing-deps "$STIRLING_JAR" 2>/dev/null || echo "")
    if [ -n "$REQUIRED_MODULES" ]; then
        print_success "jdeps detected modules: $REQUIRED_MODULES"
        # Add additional modules we know Stirling-PDF needs
        MODULES="$REQUIRED_MODULES,java.compiler,java.instrument,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.transaction.xa,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported"
    else
        print_warning "jdeps analysis failed, using predefined module list"
        MODULES="java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported"
    fi
else
    print_warning "jdeps not available, using predefined module list"
    MODULES="java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported"
fi

print_step "Creating JLink runtime with modules: $MODULES"

# Remove existing runtime if present
rm -rf "$TAURI_RUNTIME_DIR/jre"

# Create the custom JRE
jlink \
    --add-modules "$MODULES" \
    --strip-debug \
    --compress=2 \
    --no-header-files \
    --no-man-pages \
    --output "$TAURI_RUNTIME_DIR/jre"

if [ ! -d "$TAURI_RUNTIME_DIR/jre" ]; then
    print_error "Failed to create JLink runtime"
    exit 1
fi

print_success "JLink runtime created at $TAURI_RUNTIME_DIR/jre"

# Calculate runtime size
RUNTIME_SIZE=$(du -sh "$TAURI_RUNTIME_DIR/jre" | cut -f1)
print_success "Runtime size: $RUNTIME_SIZE"

# Create launcher scripts for testing
print_step "Creating launcher scripts for testing..."

LAUNCHER_SCRIPT="$TAURI_RUNTIME_DIR/launch-stirling.sh"
cat > "$LAUNCHER_SCRIPT" << 'EOF'
#!/bin/bash
# Launcher script for Stirling-PDF with bundled JRE

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JRE_DIR="$SCRIPT_DIR/jre"
LIBS_DIR="$(dirname "$SCRIPT_DIR")/libs"

# Find the Stirling-PDF JAR
STIRLING_JAR=$(ls "$LIBS_DIR"/Stirling-PDF-*.jar | head -n 1)

if [ ! -f "$STIRLING_JAR" ]; then
    echo "❌ Stirling-PDF JAR not found in $LIBS_DIR"
    exit 1
fi

# Launch with bundled JRE
"$JRE_DIR/bin/java" \
    -Xmx2g \
    -DBROWSER_OPEN=true \
    -DSTIRLING_PDF_DESKTOP_UI=false \
    -jar "$STIRLING_JAR" \
    "$@"
EOF

chmod +x "$LAUNCHER_SCRIPT"

# Create Windows launcher
LAUNCHER_BAT="$TAURI_RUNTIME_DIR/launch-stirling.bat"
cat > "$LAUNCHER_BAT" << 'EOF'
@echo off
REM Launcher script for Stirling-PDF with bundled JRE

set SCRIPT_DIR=%~dp0
set JRE_DIR=%SCRIPT_DIR%jre
set LIBS_DIR=%SCRIPT_DIR%..\libs

REM Find the Stirling-PDF JAR
for %%f in ("%LIBS_DIR%\Stirling-PDF-*.jar") do set STIRLING_JAR=%%f

if not exist "%STIRLING_JAR%" (
    echo ❌ Stirling-PDF JAR not found in %LIBS_DIR%
    exit /b 1
)

REM Launch with bundled JRE
"%JRE_DIR%\bin\java.exe" ^
    -Xmx2g ^
    -DBROWSER_OPEN=true ^
    -DSTIRLING_PDF_DESKTOP_UI=false ^
    -jar "%STIRLING_JAR%" ^
    %*
EOF

print_success "Created launcher scripts for testing"

# Test the bundled runtime
print_step "Testing bundled JRE..."
if [ -f "$TAURI_RUNTIME_DIR/jre/bin/java" ]; then
    JAVA_VERSION_OUTPUT=$("$TAURI_RUNTIME_DIR/jre/bin/java" --version 2>&1 | head -n 1)
    print_success "Bundled JRE works: $JAVA_VERSION_OUTPUT"
else
    print_error "Bundled JRE executable not found"
    exit 1
fi

# Display summary
echo ""
print_success "🎉 JLink build setup completed successfully!"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo "   • JAR: $STIRLING_JAR"
echo "   • Runtime: $TAURI_RUNTIME_DIR/jre ($RUNTIME_SIZE)"
echo "   • Modules: $MODULES"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "   1. cd frontend"
echo "   2. npm run tauri-build"
echo ""
echo -e "${BLUE}💡 Testing:${NC}"
echo "   • Test bundled runtime: $LAUNCHER_SCRIPT"
echo "   • Tauri configuration already updated to include bundled JRE"
echo ""
echo -e "${BLUE}💡 Benefits:${NC}"
echo "   • No external JRE dependency"
echo "   • Smaller distribution size with custom runtime"
echo "   • Better security with minimal required modules"
echo "   • Consistent Java version across all deployments"
echo ""
print_success "The application will now run without requiring users to install Java!"