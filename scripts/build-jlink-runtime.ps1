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
$Compress = if ($HelpText -match "zip-\[0-9\]") { "zip-6" } else { "2" }

& $Jlink `
    --add-modules "$Modules,jdk.crypto.mscapi" `
    --strip-debug `
    --compress="$Compress" `
    --no-header-files `
    --no-man-pages `
    --output runtime/jre

Get-ChildItem -Recurse runtime/jre -Force -File | ForEach-Object {
    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
}
