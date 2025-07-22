@echo off
REM --------------------------------------------------
REM Batch script to (re-)generate all requirements
REM with check for pip-compile and user confirmation
REM --------------------------------------------------

REM Check if pip-compile is available
pip-compile --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: pip-compile was not found.
    echo Please install pip-tools:
    echo   pip install pip-tools
    echo and ensure that pip-compile is in your PATH.
    pause
    exit /b 1
)

echo pip-compile detected.

REM Prompt user for confirmation (default = Yes on ENTER)
set /p confirm="Do you want to generate all requirements? [Y/n] "
if /I "%confirm%"=="" set confirm=Y

if /I not "%confirm%"=="Y" (
    echo Generation cancelled by user.
    pause
    exit /b 0
)

echo Starting generation...

echo Generating .github\scripts\requirements_pre_commit.txt
pip-compile --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_pre_commit.txt" ^
  ".github\scripts\requirements_pre_commit.in"

echo Generating .github\scripts\requirements_sync_readme.txt
pip-compile --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_sync_readme.txt" ^
  ".github\scripts\requirements_sync_readme.in"

echo Generating testing\cucumber\requirements.txt
pip-compile --generate-hashes --upgrade --strip-extras ^
  --output-file="testing\cucumber\requirements.txt" ^
  "testing\cucumber\requirements.in"

echo All done!
pause
