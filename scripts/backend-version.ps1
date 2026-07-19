$ErrorActionPreference = 'Stop'

$output = & "$PSScriptRoot/../gradlew.bat" printVersion --quiet 2>&1
$lines = @($output | Where-Object { $_.ToString().Trim() })
if ($lines.Count -eq 0) {
    exit 0
}

Write-Output $lines[-1]
