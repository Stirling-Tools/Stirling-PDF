@echo off
REM --------------------------------------------------
REM Batch script to (re-)generate all requirements
REM with check for pip-compile and user confirmation
REM --------------------------------------------------

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "ENGINE_PIP_COMPILE=%REPO_ROOT%\engine\.venv\Scripts\pip-compile.exe"

REM Check if engine venv pip-compile is available
"%ENGINE_PIP_COMPILE%" --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Engine venv pip-compile was not found.
    echo Expected: "%ENGINE_PIP_COMPILE%"
    echo Please create the engine venv first, e.g.:
    echo   task engine:install
    pause
    exit /b 1
)

echo Engine venv pip-compile detected.

REM Prompt user for confirmation (default = Yes on ENTER)
set /p confirm="Do you want to generate all requirements? [Y/n] "
if /I "%confirm%"=="" set confirm=Y

if /I not "%confirm%"=="Y" (
    echo Generation cancelled by user.
    pause
    exit /b 0
)

echo Starting generation...

echo Generating .github\scripts\requirements_dev.txt
"%ENGINE_PIP_COMPILE%" --allow-unsafe --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_dev.txt" ^
  ".github\scripts\requirements_dev.in"

echo Generating .github\scripts\requirements_pre_commit.txt
"%ENGINE_PIP_COMPILE%" --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_pre_commit.txt" ^
  ".github\scripts\requirements_pre_commit.in"

echo Generating .github\scripts\requirements_sync_readme.txt
"%ENGINE_PIP_COMPILE%" --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_sync_readme.txt" ^
  ".github\scripts\requirements_sync_readme.in"

echo Generating testing\cucumber\requirements.txt
"%ENGINE_PIP_COMPILE%" --generate-hashes --upgrade --strip-extras ^
  --output-file="testing\cucumber\requirements.txt" ^
  "testing\cucumber\requirements.in"

echo All done!
pause
