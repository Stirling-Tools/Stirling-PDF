param(
    [Parameter(Mandatory = $true)]
    [string]$Modules
)

$ErrorActionPreference = "Stop"

$Jlink = if ($env:JAVA_HOME) {
    Join-Path $env:JAVA_HOME "bin/jlink.exe"
} else {
    "jlink.exe"
}

$HelpText = & $Jlink --help 2>&1 | Out-String
# Older JDKs do not support the newer zip compressor selector, so fall back to
# the numeric compression level they do understand.
$Compress = if ($HelpText -match "zip-\[0-9\]") { "zip-6" } else { "2" }

& $Jlink `
    --add-modules "$Modules,jdk.crypto.mscapi" `
    --strip-debug `
    --compress="$Compress" `
    --no-header-files `
    --no-man-pages `
    --output runtime/jre

# Tauri's resource staging preserves source permissions, so the bundled runtime
# must be writable here or the next incremental build can fail on read-only JRE
# files copied into the target directory.
Get-ChildItem -Recurse runtime/jre -Force -File | ForEach-Object {
    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
}
