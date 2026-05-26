# Local mirror of scripts/db-migration/run-migration-test.sh - for developers
# on Windows. Boots the current Stirling-PDF JAR against each historical H2
# fixture, then verifies admin login still works. Source of truth for CI is
# the bash script.

[CmdletBinding()]
param(
    [string] $StirlingJar,
    [string] $FixtureDir,
    [string] $AdminUsername = 'admin',
    [string] $AdminPassword = 'stirling',
    [int]    $StartupTimeoutSec = 300
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Resolve-Path (Join-Path $scriptDir '..\..')

if (-not $FixtureDir) {
    $FixtureDir = Join-Path $repoRoot 'app\proprietary\src\test\resources\db-migration-fixtures'
}
if (-not $StirlingJar) {
    $candidate = Get-ChildItem (Join-Path $repoRoot 'app\core\build\libs') -Filter 'Stirling-PDF*.jar' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '-(plain|sources)\.jar$' } | Select-Object -First 1
    if (-not $candidate) {
        throw "No JAR under app/core/build/libs - run: .\gradlew :stirling-pdf:bootJar"
    }
    $StirlingJar = $candidate.FullName
}

function Find-FreePort {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $l.Start(); $port = $l.LocalEndpoint.Port; $l.Stop(); return $port
}

function Wait-ForUrl {
    param([string] $Url, [int] $Port, [int] $TimeoutSec)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            $a = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($a.AsyncWaitHandle.WaitOne(2000)) {
                $tcp.EndConnect($a); $tcp.Close()
                try {
                    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
                    if ($r.StatusCode -gt 0) { return $true }
                } catch [System.Net.WebException] {
                    if ($_.Exception.Response) { return $true }
                } catch {}
            }
        } catch { } finally { $tcp.Close() }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Test-Fixture {
    param([string] $FixturePath)
    $label = [System.IO.Path]::GetFileNameWithoutExtension([System.IO.Path]::GetFileNameWithoutExtension($FixturePath))
    Write-Host "=== $label ===" -ForegroundColor Cyan

    $workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("stirling-mig-" + [Guid]::NewGuid().ToString('N').Substring(0,8))
    $configsdir = Join-Path $workdir 'configs'
    $null = New-Item -ItemType Directory -Force -Path $configsdir
    Copy-Item $FixturePath (Join-Path $configsdir 'stirling-pdf-DB-2.3.232.mv.db')

    $port = Find-FreePort
    $baseUrl = "http://127.0.0.1:$port"
    $logFile = Join-Path $workdir 'app.log'

    Write-Host "  jar=$StirlingJar"
    Write-Host "  workdir=$workdir"
    Write-Host "  port=$port"

    $proc = $null
    try {
        Push-Location $workdir
        try {
            $javaArgs = @(
                '-Xmx1g',
                '-jar', $StirlingJar,
                "--server.port=$port",
                '--spring.datasource.url=jdbc:h2:file:./configs/stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=TRUE;MODE=PostgreSQL',
                '--logging.level.root=WARN',
                '--logging.level.stirling=INFO',
                '--logging.level.org.hibernate.tool.schema=INFO'
            )
            $proc = Start-Process -FilePath 'java' -ArgumentList $javaArgs -PassThru -NoNewWindow `
                -RedirectStandardOutput $logFile -RedirectStandardError (Join-Path $workdir 'app.err.log')
        } finally { Pop-Location }

        if (-not (Wait-ForUrl -Url "$baseUrl/login" -Port $port -TimeoutSec $StartupTimeoutSec)) {
            Write-Host "  app did not respond within $StartupTimeoutSec sec; last lines of stdout:" -ForegroundColor Red
            Get-Content $logFile -Tail 60 -ErrorAction SilentlyContinue | Write-Host
            throw "$label`: app did not respond"
        }
        Write-Host "  app started"

        # Catch Hibernate schema-update errors in the startup log.
        $errs = Select-String -Path $logFile -Pattern 'SchemaManagementException|GenerationTarget encountered exception' -ErrorAction SilentlyContinue
        if ($errs) {
            Write-Host "  Hibernate reported schema errors:" -ForegroundColor Red
            $errs | ForEach-Object { Write-Host "    $($_.Line)" }
            throw "$label`: schema migration errors"
        }

        $loginJson = @{ username = $AdminUsername; password = $AdminPassword } | ConvertTo-Json -Compress
        try {
            $resp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/login" -Method POST `
                -ContentType 'application/json' -Body $loginJson -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            $code = [int]$resp.StatusCode
        } catch [System.Net.WebException] {
            $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
        }
        Write-Host "  POST /api/v1/auth/login -> HTTP $code"
        if ($code -ne 200) {
            Write-Host "  last 40 lines of app log:" -ForegroundColor Yellow
            Get-Content $logFile -Tail 40 -ErrorAction SilentlyContinue | Write-Host
            throw "$label`: login did not return 200 (got $code)"
        }

        Write-Host "  PASS: $label migrated and admin login succeeded" -ForegroundColor Green
        return $true
    } finally {
        if ($proc -and -not $proc.HasExited) {
            taskkill /PID $proc.Id /T /F 2>$null | Out-Null
            $proc.WaitForExit(15000) | Out-Null
        }
        Remove-Item -Recurse -Force -ErrorAction Ignore $workdir
    }
}

if (-not (Test-Path $FixtureDir)) { throw "Fixture dir not found: $FixtureDir" }
$fixtures = @(Get-ChildItem $FixtureDir -Filter '*.mv.db' | Sort-Object Name)
if ($fixtures.Count -eq 0) { throw "No fixtures in $FixtureDir" }

$failed = @()
foreach ($f in $fixtures) {
    try { Test-Fixture -FixturePath $f.FullName | Out-Null }
    catch {
        Write-Host "  FAIL: $($f.Name) - $_" -ForegroundColor Red
        $failed += $f.Name
    }
}

if ($failed.Count -gt 0) {
    Write-Host "`n$($failed.Count) fixture(s) failed migration:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host "`nAll $($fixtures.Count) fixtures migrated cleanly." -ForegroundColor Green
