# Generate H2 database fixtures by running historical Stirling-PDF releases
# locally. Run once on a developer machine; the produced .mv.db files are
# committed to app/proprietary/src/test/resources/db-migration-fixtures/ and
# consumed by the migration CI test.
#
# Usage:
#   pwsh scripts/db-migration/generate-fixtures.ps1 -Versions v2.0.0,v2.5.0,v2.10.0
#   pwsh scripts/db-migration/generate-fixtures.ps1                      # all defaults
#
# Requirements:
#   - Java 21+ (older Stirling-PDF JARs target Java 17/21)
#   - PowerShell 7+
#   - `gh` CLI authenticated to github.com/Stirling-Tools/Stirling-PDF

[CmdletBinding()]
param(
    [string[]] $Versions = @('v2.0.0', 'v2.5.0', 'v2.10.0'),
    [string] $WorkRoot,
    [string] $FixtureDir,
    [int] $StartupTimeoutSec = 240,
    [int] $ShutdownTimeoutSec = 90
)

$ErrorActionPreference = 'Stop'

# Locate the repo root from this script's path (works regardless of $PWD).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..')
if (-not $WorkRoot)   { $WorkRoot   = Join-Path $repoRoot '.alpha-local\migration-fixtures' }
if (-not $FixtureDir) { $FixtureDir = Join-Path $repoRoot 'app\proprietary\src\test\resources\db-migration-fixtures' }
Write-Host "repoRoot=$repoRoot"
Write-Host "WorkRoot=$WorkRoot"
Write-Host "FixtureDir=$FixtureDir"

function Wait-ForEndpoint {
    param([string] $Url, [int] $Port, [int] $TimeoutSec)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        # First, see if the TCP port is open (catches startup-in-progress without
        # depending on PS 5.1 vs 7 behavioral differences in Invoke-WebRequest).
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            $async = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(2000)) {
                $tcp.EndConnect($async)
                $tcp.Close()
                # Port is open - issue an HTTP request to confirm Spring is serving.
                try {
                    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
                    if ($r.StatusCode -gt 0) { return $true }
                } catch [System.Net.WebException] {
                    # Treat 3xx/4xx as "up but redirected/protected" - that's a yes.
                    $resp = $_.Exception.Response
                    if ($resp -and [int]$resp.StatusCode -gt 0) { return $true }
                } catch {
                    # Other transient error - keep polling.
                }
            }
        } catch { } finally { $tcp.Close() }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Find-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    return $port
}

function Invoke-FixtureGeneration {
    param([string] $Version)

    Write-Host "=== Generating fixture for $Version ===" -ForegroundColor Cyan

    $jarsDir = Join-Path $WorkRoot 'jars'
    $null = New-Item -ItemType Directory -Force -Path $jarsDir
    $jarPath = Join-Path $jarsDir "stirling-pdf-$Version.jar"

    if (-not (Test-Path $jarPath)) {
        Write-Host "Downloading $Version JAR..." -ForegroundColor DarkCyan
        & gh release download $Version --repo Stirling-Tools/Stirling-PDF `
            --pattern 'Stirling-PDF-with-login.jar' `
            --output $jarPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to download $Version" }
    }

    $runDir = Join-Path $WorkRoot $Version
    Remove-Item -Recurse -Force -ErrorAction Ignore $runDir
    $configsDir = Join-Path $runDir 'configs'
    $null = New-Item -ItemType Directory -Force -Path $configsDir

    $port = Find-FreePort
    Write-Host "Starting $Version on port $port (workdir=$runDir)..." -ForegroundColor DarkCyan

    # Override the H2 URL to force DB_CLOSE_ON_EXIT=TRUE so the JVM shutdown
    # hook flushes the file even if Spring's graceful shutdown is interrupted.
    $h2Url = 'jdbc:h2:file:./configs/stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=TRUE;MODE=PostgreSQL'

    $stdoutLog = Join-Path $runDir 'stdout.log'
    $stderrLog = Join-Path $runDir 'stderr.log'

    $javaArgs = @(
        '-Xmx1g',
        '-jar', $jarPath,
        "--server.port=$port",
        "--spring.datasource.url=$h2Url",
        '--logging.level.root=WARN',
        '--logging.level.stirling=INFO',
        '--management.endpoints.web.exposure.include=health,shutdown',
        '--management.endpoint.shutdown.enabled=true',
        '--SYSTEM_DEFAULTLOCALE=en-US',
        # Disable browser launch and any startup popups
        '--system.showOutdatedFiles=false',
        '--system.enableAlphaFunctionality=true'
    )

    Push-Location $runDir
    try {
        $proc = Start-Process -FilePath 'java' -ArgumentList $javaArgs `
            -PassThru -NoNewWindow `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog

        $baseUrl = "http://localhost:$port"
        $ready = Wait-ForEndpoint -Url "$baseUrl/login" -Port $port -TimeoutSec $StartupTimeoutSec
        if (-not $ready) {
            Write-Host "$Version did not become ready - tail of stderr:" -ForegroundColor Red
            Get-Content $stderrLog -Tail 30 | Write-Host
            throw "$Version did not respond on $baseUrl/login within $StartupTimeoutSec sec"
        }

        Write-Host "$Version is up. Exercising endpoints to populate tables..." -ForegroundColor DarkCyan

        $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
        $session.Cookies = [System.Net.CookieContainer]::new()

        $invokeQuiet = {
            param([string] $Method = 'GET', [string] $Uri,
                  [string] $ContentType, $Body,
                  [hashtable] $Headers,
                  [int] $Timeout = 20, [int] $MaxRedirect = 5)
            $a = @{ Uri = $Uri; Method = $Method; WebSession = $session;
                    UseBasicParsing = $true; TimeoutSec = $Timeout;
                    MaximumRedirection = $MaxRedirect; ErrorAction = 'Stop' }
            if ($ContentType) { $a['ContentType'] = $ContentType }
            if ($Body)        { $a['Body']        = $Body }
            if ($Headers)     { $a['Headers']     = $Headers }
            try {
                $r = Invoke-WebRequest @a
                return @{ Code = [int]$r.StatusCode; Body = $r.Content; Headers = $r.Headers }
            } catch [System.Net.WebException] {
                $resp = $_.Exception.Response
                $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
                $body = $null
                if ($resp) {
                    try { $body = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch {}
                }
                return @{ Code = $code; Body = $body; Headers = @{} }
            } catch {
                return @{ Code = -1; Body = $_.Exception.Message; Headers = @{} }
            }
        }

        # 1. GET /login first to get cookies/CSRF (needed for form login to create a SESSIONS row).
        $loginPage = & $invokeQuiet -Uri "$baseUrl/login"
        Write-Host ("  GET  /login (page)         -> HTTP {0}" -f $loginPage.Code)
        $csrfToken = $null
        if ($loginPage.Body -match 'name="_csrf"\s+value="([^"]+)"') { $csrfToken = $Matches[1] }

        # 2. JSON REST login - issues JWT cookie
        $loginJson = @{ username = 'admin'; password = 'stirling' } | ConvertTo-Json -Compress
        $loginResp = & $invokeQuiet -Method POST -Uri "$baseUrl/api/v1/auth/login" -ContentType 'application/json' -Body $loginJson
        Write-Host ("  POST /api/v1/auth/login    -> HTTP {0}" -f $loginResp.Code)

        # 3. Form login with CSRF (creates HTTP session row, may create persistent_logins if remember-me)
        $formBody = "username=admin&password=stirling&remember-me=true"
        if ($csrfToken) { $formBody += "&_csrf=$csrfToken" }
        $formResp = & $invokeQuiet -Method POST -Uri "$baseUrl/login" -ContentType 'application/x-www-form-urlencoded' -Body $formBody
        Write-Host ("  POST /login (form+csrf)    -> HTTP {0}" -f $formResp.Code)

        # 4. Authenticated activity (writes user_settings rows on PUT, audit on EE, etc.)
        foreach ($ep in @('/', '/account', '/home', '/api/v1/info/status', '/api/v1/user/get-api-key', '/api/v1/user/settings')) {
            $r = & $invokeQuiet -Uri "$baseUrl$ep"
            Write-Host ("  GET  {0,-32}-> HTTP {1}" -f $ep, $r.Code)
        }

        # 5. Save a user setting -> writes user_settings row.
        foreach ($settingsBody in @('{"key":"theme","value":"dark"}',
                                     '{"theme":"dark","language":"en-US"}',
                                     '{"key":"locale","value":"en-US"}')) {
            $r = & $invokeQuiet -Method POST -Uri "$baseUrl/api/v1/user/settings" -ContentType 'application/json' -Body $settingsBody
            Write-Host ("  POST /api/v1/user/settings -> HTTP {0}" -f $r.Code)
        }
        # PUT variant for newer versions
        $r = & $invokeQuiet -Method PUT -Uri "$baseUrl/api/v1/user/settings" -ContentType 'application/json' -Body '{"theme":"dark"}'
        Write-Host ("  PUT  /api/v1/user/settings -> HTTP {0}" -f $r.Code)

        # 6. Best-effort 2nd user (covers two known endpoint shapes).
        $r = & $invokeQuiet -Method POST -Uri "$baseUrl/api/v1/user/admin/saveUser" -ContentType 'application/x-www-form-urlencoded' -Body 'username=fixtureuser&password=fixturepass&role=ROLE_USER'
        Write-Host ("  POST admin/saveUser        -> HTTP {0}" -f $r.Code)
        $createJson = @{ username = 'fixtureuser2'; password = 'fixturepass'; role = 'ROLE_USER' } | ConvertTo-Json -Compress
        $r = & $invokeQuiet -Method POST -Uri "$baseUrl/api/v1/user/admin/users" -ContentType 'application/json' -Body $createJson
        Write-Host ("  POST admin/users (json)    -> HTTP {0}" -f $r.Code)

        # 7. Best-effort invite token (only succeeds on versions with the endpoint).
        $r = & $invokeQuiet -Method POST -Uri "$baseUrl/api/v1/invite/create" -ContentType 'application/json' -Body '{"email":"invitee@example.com","role":"ROLE_USER"}'
        Write-Host ("  POST invite/create         -> HTTP {0}" -f $r.Code)

        # Give async audit/session writes a moment to flush.
        Start-Sleep -Seconds 3

        Write-Host "Shutting down $Version..." -ForegroundColor DarkCyan
        # PowerShell's Stop-Process == TerminateProcess (no shutdown hooks). That's OK because
        # the DB URL forces DB_CLOSE_ON_EXIT=TRUE, which still flushes the H2 file via the
        # native H2 JVM shutdown hook. Verified by inspecting the produced .mv.db.
        taskkill /PID $proc.Id /T /F 2>$null | Out-Null
        $proc.WaitForExit(($ShutdownTimeoutSec * 1000)) | Out-Null

        # Locate the produced DB file
        $dbFile = Get-ChildItem -Path $configsDir -Filter '*.mv.db' -ErrorAction Stop |
            Select-Object -First 1
        if (-not $dbFile) {
            throw "No .mv.db file produced under $configsDir"
        }

        $null = New-Item -ItemType Directory -Force -Path $FixtureDir
        $destName = "stirling-pdf-$Version.mv.db"
        $dest = Join-Path $FixtureDir $destName
        Copy-Item $dbFile.FullName $dest -Force
        Write-Host "  -> $dest  ($([math]::Round($dbFile.Length/1KB, 1)) KB)" -ForegroundColor Green
    } finally {
        Pop-Location
        if ($proc -and -not $proc.HasExited) {
            try { taskkill /PID $proc.Id /T /F | Out-Null } catch {}
        }
    }
}

foreach ($v in $Versions) {
    Invoke-FixtureGeneration -Version $v
}

Write-Host ""
Write-Host "All fixtures generated. Contents of $FixtureDir :" -ForegroundColor Cyan
Get-ChildItem -Path $FixtureDir -Filter '*.mv.db' | Format-Table Name, @{N='Size (KB)';E={[math]::Round($_.Length/1KB,1)}}
