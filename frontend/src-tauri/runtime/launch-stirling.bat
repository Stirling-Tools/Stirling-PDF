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
