@echo off
REM Build script for Tauri with JLink runtime bundling
REM This script creates a self-contained Java runtime for Stirling-PDF

echo 🔧 Building Stirling-PDF with JLink runtime for Tauri...

echo ▶ Checking Java environment...
java -version >nul 2>&1
if errorlevel 1 (
    echo ❌ Java is not installed or not in PATH
    exit /b 1
)

jlink --version >nul 2>&1
if errorlevel 1 (
    echo ❌ jlink is not available. Please ensure you have a JDK ^(not just JRE^) installed.
    exit /b 1
)

echo ✅ Java and jlink detected

echo ▶ Building Stirling-PDF JAR...
call gradlew.bat clean bootJar --no-daemon
if errorlevel 1 (
    echo ❌ Failed to build Stirling-PDF JAR
    exit /b 1
)

REM Find the built JAR
for %%f in (build\libs\Stirling-PDF-*.jar) do set STIRLING_JAR=%%f
if not exist "%STIRLING_JAR%" (
    echo ❌ No Stirling-PDF JAR found in build/libs/
    exit /b 1
)

echo ✅ Built JAR: %STIRLING_JAR%

echo ▶ Creating Tauri directories...
if not exist "frontend\src-tauri\libs" mkdir "frontend\src-tauri\libs"
if not exist "frontend\src-tauri\runtime" mkdir "frontend\src-tauri\runtime"

echo ▶ Copying JAR to Tauri libs directory...
copy "%STIRLING_JAR%" "frontend\src-tauri\libs\"
echo ✅ JAR copied to frontend\src-tauri\libs\

echo ▶ Creating custom JRE with jlink...
if exist "frontend\src-tauri\runtime\jre" rmdir /s /q "frontend\src-tauri\runtime\jre"

REM Use predefined module list for Windows (jdeps may not be available)
set MODULES=java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported

echo ▶ Creating JLink runtime with modules: %MODULES%

jlink ^
    --add-modules %MODULES% ^
    --strip-debug ^
    --compress=2 ^
    --no-header-files ^
    --no-man-pages ^
    --output "frontend\src-tauri\runtime\jre"

if not exist "frontend\src-tauri\runtime\jre" (
    echo ❌ Failed to create JLink runtime
    exit /b 1
)

echo ✅ JLink runtime created at frontend\src-tauri\runtime\jre

echo ▶ Creating launcher scripts for testing...

REM Create Windows launcher script
echo @echo off > "frontend\src-tauri\runtime\launch-stirling.bat"
echo REM Launcher script for Stirling-PDF with bundled JRE >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo. >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo set SCRIPT_DIR=%%~dp0 >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo set JRE_DIR=%%SCRIPT_DIR%%jre >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo set LIBS_DIR=%%SCRIPT_DIR%%..\libs >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo. >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo REM Find the Stirling-PDF JAR >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo for %%%%f in ("%%LIBS_DIR%%\Stirling-PDF-*.jar") do set STIRLING_JAR=%%%%f >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo. >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo if not exist "%%STIRLING_JAR%%" ^( >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     echo ❌ Stirling-PDF JAR not found in %%LIBS_DIR%% >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     exit /b 1 >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo ^) >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo. >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo REM Launch with bundled JRE >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo "%%JRE_DIR%%\bin\java.exe" ^^ >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     -Xmx2g ^^ >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     -DBROWSER_OPEN=true ^^ >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     -DSTIRLING_PDF_DESKTOP_UI=false ^^ >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     -jar "%%STIRLING_JAR%%" ^^ >> "frontend\src-tauri\runtime\launch-stirling.bat"
echo     %%* >> "frontend\src-tauri\runtime\launch-stirling.bat"

echo ✅ Created launcher scripts for testing

echo ▶ Testing bundled JRE...
"frontend\src-tauri\runtime\jre\bin\java.exe" --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Bundled JRE test failed
    exit /b 1
) else (
    echo ✅ Bundled JRE works correctly
)

echo.
echo ✅ 🎉 JLink build setup completed successfully!
echo.
echo 📊 Summary:
echo    • JAR: %STIRLING_JAR%
echo    • Runtime: frontend\src-tauri\runtime\jre
echo    • Modules: %MODULES%
echo.
echo 📋 Next steps:
echo    1. cd frontend
echo    2. npm run tauri build
echo.
echo 💡 Testing:
echo    • Test bundled runtime: frontend\src-tauri\runtime\launch-stirling.bat
echo    • Tauri configuration already updated to include bundled JRE
echo.
echo 💡 Benefits:
echo    • No external JRE dependency
echo    • Smaller distribution size with custom runtime
echo    • Better security with minimal required modules
echo    • Consistent Java version across all deployments
echo.
echo ✅ The application will now run without requiring users to install Java!