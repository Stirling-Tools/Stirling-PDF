@echo off
echo 🔨 Building Stirling PDF with Tauri integration...

REM Build the Java backend
echo 📦 Building Java backend...
call gradlew.bat bootJar

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to build Java backend
    exit /b 1
)

echo ✅ Java backend built successfully

REM Copy the JAR to Tauri resources
echo 📋 Copying JAR file to Tauri resources...
if not exist "frontend\src-tauri\libs" mkdir frontend\src-tauri\libs
copy "build\libs\Stirling-PDF-*.jar" "frontend\src-tauri\libs\"
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to copy JAR file
    exit /b 1
)
echo ✅ JAR copied successfully

REM Navigate to frontend and run Tauri
echo 🚀 Starting Tauri development server...
cd frontend
npx tauri dev