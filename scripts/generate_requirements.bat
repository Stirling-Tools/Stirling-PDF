@echo off
REM --------------------------------------------------
REM Batch script to (re-)generate all requirements
REM with check for uv and user confirmation
REM --------------------------------------------------

REM Check if uv pip compile is available
uv pip compile --help >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: uv pip compile was not found.
    echo Please install uv and ensure it is available on PATH.
    pause
    exit /b 1
)

echo uv pip compile detected.

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
uv pip compile --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_dev.txt" ^
  ".github\scripts\requirements_dev.in"

echo Generating .github\scripts\requirements_pre_commit.txt
uv pip compile --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_pre_commit.txt" ^
  ".github\scripts\requirements_pre_commit.in"

echo Generating .github\scripts\requirements_sync_readme.txt
uv pip compile --generate-hashes --upgrade --strip-extras ^
  --output-file=".github\scripts\requirements_sync_readme.txt" ^
  ".github\scripts\requirements_sync_readme.in"

echo Generating testing\cucumber\uv.lock
pushd testing\cucumber
uv lock
popd

echo All done!
pause
