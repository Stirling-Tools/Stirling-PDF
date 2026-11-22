$ErrorActionPreference = "Stop"

$scripts = $PSScriptRoot
$work = Join-Path ([IO.Path]::GetTempPath()) ("sign-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe not found" }

$password = [Guid]::NewGuid().ToString("N")
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Stirling Signing Test" -CertStoreLocation Cert:\CurrentUser\My
$pfx = Join-Path $work "test.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
$cer = Join-Path $work "test.cer"
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

$fakeBin = Join-Path $work "bin"
New-Item -ItemType Directory -Path $fakeBin | Out-Null
$fakeSmctl = Join-Path $fakeBin "smctl.ps1"
@"
`$target = `$args[[Array]::IndexOf(`$args, '--input') + 1]
Add-Content -LiteralPath '$work\smctl-calls.txt' -Value `$target
if (`$env:FAKE_SMCTL_NO_OP -eq '1') { exit 0 }
& '$($signtool.FullName)' sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f '$pfx' /p '$password' `$target | Out-Null
exit `$LASTEXITCODE
"@ | Set-Content -LiteralPath $fakeSmctl
Set-Content -LiteralPath (Join-Path $fakeBin "smctl.cmd") -Value "@pwsh -NoProfile -File `"$fakeSmctl`" %*"
$env:PATH = "$fakeBin;$env:PATH"
$env:SM_KEYPAIR_ALIAS = "test-alias"

$source = Join-Path $work "Sample.cs"
Set-Content -LiteralPath $source -Value "public static class Sample { public static int Value() { return 1; } }"
$template = Join-Path $work "template.dll"
Add-Type -TypeDefinition (Get-Content -Raw $source) -OutputAssembly $template -OutputType Library

$failures = 0
function Check([string]$name, [bool]$condition) {
  if ($condition) { Write-Host "[PASS] $name" } else { Write-Host "[FAIL] $name"; $script:failures++ }
}
function Status([string]$file) { (Get-AuthenticodeSignature -LiteralPath $file).Status }
function New-Unsigned([string]$relative) {
  $path = Join-Path $work $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  Copy-Item -LiteralPath $template -Destination $path
  $path
}
function Invoke-Sign([string]$file) {
  pwsh -NoProfile -NonInteractive -File (Join-Path $scripts "sign-windows-file.ps1") $file | Out-Host
  $LASTEXITCODE
}
function Get-Calls { @(Get-Content -LiteralPath "$work\smctl-calls.txt" -ErrorAction SilentlyContinue).Count }

$plus = New-Unsigned "runtime\bin\libc++.dll"
Check "signs a file with + in its name" ((Invoke-Sign $plus) -eq 0 -and (Status $plus) -eq "Valid")

$callsBefore = Get-Calls
Check "leaves an already signed file alone" ((Invoke-Sign $plus) -eq 0 -and (Get-Calls) -eq $callsBefore)

$uninstaller = New-Unsigned "nsis\nst8A2F.tmp"
$exitCode = Invoke-Sign $uninstaller
$asExe = Join-Path $work "uninstaller-check.exe"
Copy-Item -LiteralPath $uninstaller -Destination $asExe
Check "signs an extensionless PE such as the NSIS uninstaller" ($exitCode -eq 0 -and (Status $asExe) -eq "Valid")

$wix = New-Unsigned "target\release\wix\x64\wix\WixUIExtension.dll"
$callsBefore = Get-Calls
Check "skips WiX extension DLLs" ((Invoke-Sign $wix) -eq 0 -and (Status $wix) -ne "Valid" -and (Get-Calls) -eq $callsBefore)

$plugin = New-Unsigned "target\release\nsis\arm64\Plugins\x86-unicode\System.dll"
Check "skips NSIS built-in plugins" ((Invoke-Sign $plugin) -eq 0 -and (Status $plugin) -ne "Valid")

$additional = New-Unsigned "target\release\nsis\arm64\Plugins\x86-unicode\additional\nsis_tauri_utils.dll"
Check "signs NSIS additional plugins" ((Invoke-Sign $additional) -eq 0 -and (Status $additional) -eq "Valid")

$dangling = New-Unsigned "runtime\bin\msvcp140_atomic_wait.dll"
$bytes = [IO.File]::ReadAllBytes($dangling)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
$optional = $pe + 24
$entry = $optional + $(if ([BitConverter]::ToUInt16($bytes, $optional) -eq 0x20b) { 112 } else { 96 }) + 32
[BitConverter]::GetBytes([uint32]$bytes.Length).CopyTo($bytes, $entry)
[BitConverter]::GetBytes([uint32]9000).CopyTo($bytes, $entry + 4)
[IO.File]::WriteAllBytes($dangling, $bytes)
Check "signs a file whose certificate table points past its end" ((Invoke-Sign $dangling) -eq 0 -and (Status $dangling) -eq "Valid")

$env:FAKE_SMCTL_NO_OP = "1"
$silent = New-Unsigned "runtime\bin\silent.dll"
Check "fails when smctl exits 0 without signing" ((Invoke-Sign $silent) -ne 0)
Remove-Item Env:\FAKE_SMCTL_NO_OP

$tree = Join-Path $work "tree"
New-Item -ItemType Directory -Force -Path "$tree\bin\server" | Out-Null
Copy-Item $template "$tree\bin\a.dll"; Copy-Item $template "$tree\bin\server\b.dll"; Copy-Item $template "$tree\bin\c.exe"
pwsh -NoProfile -NonInteractive -File (Join-Path $scripts "sign-windows-runtime.ps1") -Root $tree -VerifyOnly | Out-Host
Check "verify-only fails on an unsigned tree" ($LASTEXITCODE -ne 0)
pwsh -NoProfile -NonInteractive -File (Join-Path $scripts "sign-windows-runtime.ps1") -Root $tree | Out-Host
$signed = $LASTEXITCODE
pwsh -NoProfile -NonInteractive -File (Join-Path $scripts "sign-windows-runtime.ps1") -Root $tree -VerifyOnly | Out-Host
Check "runtime script signs a tree and verify-only then passes" ($signed -eq 0 -and $LASTEXITCODE -eq 0)

$env:WINDOWS_SIGNATURE_STORE = Join-Path $work "store"
$env:WINDOWS_SIGNATURE_STORE_NEW = Join-Path $work "store-new"
$env:SM_CODE_SIGNING_CERT_SHA1_HASH = $cert.Thumbprint

$first = New-Unsigned "reuse\first\jpdfium.dll"
$callsBefore = Get-Calls
$firstExit = Invoke-Sign $first
Check "signs and saves a signature on a store miss" ($firstExit -eq 0 -and (Status $first) -eq "Valid" -and (Get-Calls) -eq $callsBefore + 1 -and @(Get-ChildItem $env:WINDOWS_SIGNATURE_STORE_NEW -Filter *.sig).Count -eq 1)

$second = New-Unsigned "reuse\second\jpdfium.dll"
$callsBefore = Get-Calls
$secondExit = Invoke-Sign $second
Check "reuses the saved signature for identical bytes without calling smctl" ($secondExit -eq 0 -and (Status $second) -eq "Valid" -and (Get-Calls) -eq $callsBefore)
Check "reused file is byte-identical to the freshly signed one" ((Get-FileHash $first).Hash -eq (Get-FileHash $second).Hash)

$otherSource = Join-Path $work "Other.cs"
Set-Content -LiteralPath $otherSource -Value "public static class Other { public static int Value() { return 2; } }"
$otherTemplate = Join-Path $work "other.dll"
Add-Type -TypeDefinition (Get-Content -Raw $otherSource) -OutputAssembly $otherTemplate -OutputType Library
$otherFirst = Join-Path $work "reuse\other-first.dll"
Copy-Item $otherTemplate $otherFirst
$storedBefore = @(Get-ChildItem $env:WINDOWS_SIGNATURE_STORE -Filter *.sig | ForEach-Object Name)
Invoke-Sign $otherFirst | Out-Null
$otherSig = Get-ChildItem $env:WINDOWS_SIGNATURE_STORE -Filter *.sig | Where-Object Name -notin $storedBefore
Check "saves one signature for the second file" (@($otherSig).Count -eq 1)
Copy-Item (Join-Path $env:WINDOWS_SIGNATURE_STORE $storedBefore[0]) $otherSig.FullName -Force
$otherSecond = Join-Path $work "reuse\other-second.dll"
Copy-Item $otherTemplate $otherSecond
$callsBefore = Get-Calls
$poisonExit = Invoke-Sign $otherSecond
Check "rejects a saved signature that belongs to different bytes and signs afresh" ($poisonExit -eq 0 -and (Status $otherSecond) -eq "Valid" -and (Get-Calls) -eq $callsBefore + 1)

$env:SM_CODE_SIGNING_CERT_SHA1_HASH = "0000000000000000000000000000000000000000"
$third = New-Unsigned "reuse\third\jpdfium.dll"
$callsBefore = Get-Calls
$thirdExit = Invoke-Sign $third
Check "does not reuse a signature from a different certificate" ($thirdExit -eq 0 -and (Status $third) -eq "Valid" -and (Get-Calls) -eq $callsBefore + 1)
$env:SM_CODE_SIGNING_CERT_SHA1_HASH = $cert.Thumbprint

function New-Dangling([string]$relative) {
  $path = New-Unsigned $relative
  $raw = [IO.File]::ReadAllBytes($path)
  [BitConverter]::GetBytes([uint32]$raw.Length).CopyTo($raw, $entry)
  [BitConverter]::GetBytes([uint32]9000).CopyTo($raw, $entry + 4)
  [IO.File]::WriteAllBytes($path, $raw)
  $path
}
$danglingFirst = New-Dangling "reuse\dangling-first\msvcp140_atomic_wait.dll"
Invoke-Sign $danglingFirst | Out-Null
$danglingSecond = New-Dangling "reuse\dangling-second\msvcp140_atomic_wait.dll"
$callsBefore = Get-Calls
$danglingExit = Invoke-Sign $danglingSecond
Check "reuses a signature for a file with a dangling certificate table" ($danglingExit -eq 0 -and (Status $danglingSecond) -eq "Valid" -and (Get-Calls) -eq $callsBefore)

Remove-Item Env:\WINDOWS_SIGNATURE_STORE, Env:\WINDOWS_SIGNATURE_STORE_NEW, Env:\SM_CODE_SIGNING_CERT_SHA1_HASH

Remove-Item -LiteralPath $cert.PSPath
Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $cert.Thumbprint | Remove-Item
if ($failures -gt 0) { throw "$failures signing script check(s) failed" }
Write-Host "All signing script checks passed"
