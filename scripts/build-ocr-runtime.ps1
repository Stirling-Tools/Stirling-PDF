<#
.SYNOPSIS
    Builds the publishable OCR runtime archive and the catalogue that points at it.

.DESCRIPTION
    Stirling-PDF shells out to a `tesseract` executable, which the Windows
    installer has never shipped. Rather than carrying ~130 MB in every installer
    for a feature most users never touch, the runtime is published once and
    installed on demand: this script produces the artefacts that get published,
    and the manifest the application reads to find them.

    Two outputs:

      tesseract-windows-x86_64-<version>.zip   the engine, ready to unpack
      ocr-manifest.json                        what the application downloads first

    The manifest is the whole point of the arrangement. Not one download URL is
    compiled into Stirling-PDF; it knows only the address of this file. Whoever
    publishes it therefore decides which engine build installations are handed,
    can withdraw or replace a bad artefact without shipping a new release of the
    application, and can move the hosting anywhere by re-running this script with
    a different -BaseUrl. Language models are catalogued straight from
    tessdata_fast at a pinned commit, so they are never rehosted - only hashed,
    so a substituted file is refused.

    The binaries come from the UB Mannheim build, the reference Windows
    distribution of Tesseract (Apache-2.0, redistributable). Its installer is an
    NSIS archive, so 7-Zip can unpack it without running it - which is precisely
    why the engine is republished as a .zip: the application can expand that with
    nothing but the JDK, while cracking an NSIS installer on the user's machine
    would need 7-Zip installed there.

    Only what the OCR paths need is kept. The DLL set below was derived by
    removing each one and re-running OCR. Training tools, and the Pango/Cairo/ICU
    stack they drag in, are dropped: well over half the payload, and no
    Stirling-PDF code path invokes them.

    tessdata/configs is not optional. The "pdf" Stirling-PDF passes as the last
    Tesseract argument is not an output format, it is the name of a config file
    read from there. An archive without it produces an engine that exits 0 and
    writes nothing, so the check at the end of this script refuses to publish one.

    osd.traineddata is catalogued as an extra rather than shipped in the engine:
    it is 10 MB, only the auto-rotate endpoint uses it, and AutoRotateController
    already degrades gracefully when it is absent.

.PARAMETER OutputDir
    Where to write the artefacts. Defaults to dist/ocr at the repository root.

.PARAMETER BaseUrl
    Where the artefacts will be reachable once published. Written into the
    manifest; change it to move the hosting.

.PARAMETER Languages
    Language codes to catalogue. Defaults to a common set so a test run is quick.

.PARAMETER AllLanguages
    Catalogue every model in tessdata_fast. This is what a real publish uses; it
    downloads each model once to hash it, so expect it to take a while.

.PARAMETER Force
    Rebuild even when the output already looks complete.

.EXAMPLE
    ./scripts/build-ocr-runtime.ps1
    ./scripts/build-ocr-runtime.ps1 -AllLanguages -BaseUrl https://github.com/OWNER/REPO/releases/download/ocr-runtime-v1
#>
[CmdletBinding()]
param(
    [string] $OutputDir,
    [string] $BaseUrl = 'https://github.com/samuelsl27/Stirling-PDF/releases/download/ocr-runtime-v1',
    [string[]] $Languages = @('eng', 'spa', 'cat', 'glg', 'eus', 'fra', 'deu', 'por', 'ita'),
    [switch] $AllLanguages,
    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$TESSERACT_VERSION = '5.4.0.20240606'
$ENGINE_VERSION = '5.4.0'
$INSTALLER_URL = "https://github.com/UB-Mannheim/tesseract/releases/download/v$TESSERACT_VERSION/tesseract-ocr-w64-setup-$TESSERACT_VERSION.exe"

# Pinned, not 'main': the manifest carries a SHA-256 per model, and those digests
# only mean anything if the bytes they describe cannot move under them.
$TESSDATA_FAST_COMMIT = '87416418657359cb625c412a48b6e1d6d41c29bd'
$TESSDATA_FAST_RAW = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$TESSDATA_FAST_COMMIT"

$PLATFORM_KEY = 'windows-x86_64'

# Required for OCR and orientation detection. Verified by elimination; see above.
$REQUIRED_DLLS = @(
    'libarchive-13.dll', 'libb2-1.dll', 'libbz2-1.dll', 'libcrypto-3-x64.dll',
    'libdeflate.dll', 'libexpat-1.dll', 'libgcc_s_seh-1.dll', 'libgif-7.dll',
    'libiconv-2.dll', 'libjbig-0.dll', 'libjpeg-8.dll', 'libleptonica-6.dll',
    'libLerc.dll', 'liblz4.dll', 'liblzma-5.dll', 'libopenjp2-7.dll',
    'libpng16-16.dll', 'libsharpyuv-0.dll', 'libstdc++-6.dll',
    'libtesseract-5.dll', 'libtiff-6.dll', 'libwebp-7.dll', 'libwebpmux-3.dll',
    'libwinpthread-1.dll', 'libzstd.dll', 'zlib1.dll'
)

# Display names for the codes most likely to be picked in the installer. Anything
# not listed falls back to its code, which the UI then translates itself.
$LANGUAGE_NAMES = @{
    'eng' = 'English'; 'spa' = 'Espanol'; 'cat' = 'Catala'; 'glg' = 'Galego'
    'eus' = 'Euskara'; 'fra' = 'Francais'; 'deu' = 'Deutsch'; 'por' = 'Portugues'
    'ita' = 'Italiano'
}

function Find-SevenZip {
    $candidates = @(
        (Get-Command '7z' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    throw "7-Zip not found. Install it (winget install 7zip.7zip) so the Tesseract installer can be unpacked."
}

function Get-Sha256 {
    param([string] $Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-RemoteLanguageCodes {
    Write-Host 'Listing tessdata_fast ...'
    $uri = "https://api.github.com/repos/tesseract-ocr/tessdata_fast/git/trees/$TESSDATA_FAST_COMMIT"
    $tree = Invoke-RestMethod -Uri $uri -Headers @{ 'User-Agent' = 'Stirling-PDF' } -UseBasicParsing
    # Root level only: the repository also carries script/*.traineddata, which are
    # script models rather than languages and are not what the picker offers.
    return $tree.tree |
        Where-Object { $_.path -like '*.traineddata' -and $_.path -notlike '*/*' } |
        ForEach-Object { $_.path -replace '\.traineddata$', '' } |
        Where-Object { $_ -ne 'osd' } |
        Sort-Object
}

<#
    Downloads a model once and reports the numbers the manifest needs. The bytes
    are thrown away: the application fetches them itself, this only records what
    they must hash to.
#>
function Get-LanguageEntry {
    param([string] $Code, [string] $ScratchDir)

    $url = "$TESSDATA_FAST_RAW/$Code.traineddata"
    $temp = Join-Path $ScratchDir "$Code.traineddata"
    if (-not (Test-Path $temp)) {
        Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing
    }
    $name = if ($LANGUAGE_NAMES.ContainsKey($Code)) { $LANGUAGE_NAMES[$Code] } else { $Code }
    return [ordered]@{
        url    = $url
        size   = (Get-Item $temp).Length
        sha256 = Get-Sha256 $temp
        name   = $name
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) { $OutputDir = Join-Path $repoRoot 'dist/ocr' }

$archiveName = "tesseract-$PLATFORM_KEY-$ENGINE_VERSION.zip"
$archivePath = Join-Path $OutputDir $archiveName
$manifestPath = Join-Path $OutputDir 'ocr-manifest.json'

if ((Test-Path $archivePath) -and (Test-Path $manifestPath) -and -not $Force) {
    Write-Host "OCR runtime already built in $OutputDir (use -Force to rebuild)."
    exit 0
}

$sevenZip = Find-SevenZip
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "stirling-ocr-$TESSERACT_VERSION"
$installer = Join-Path $staging 'installer.exe'
$unpacked = Join-Path $staging 'unpacked'
$models = Join-Path $staging 'models'
$engine = Join-Path $staging 'engine'

New-Item -ItemType Directory -Force $staging | Out-Null
New-Item -ItemType Directory -Force $models | Out-Null
New-Item -ItemType Directory -Force $OutputDir | Out-Null

if (-not (Test-Path $installer)) {
    Write-Host "Downloading Tesseract $TESSERACT_VERSION ..."
    Invoke-WebRequest -Uri $INSTALLER_URL -OutFile $installer -UseBasicParsing
}

if (-not (Test-Path (Join-Path $unpacked 'tesseract.exe'))) {
    Write-Host 'Unpacking installer ...'
    Remove-Item $unpacked -Recurse -Force -ErrorAction SilentlyContinue
    & $sevenZip x $installer "-o$unpacked" -y -bso0 -bsp0
    if ($LASTEXITCODE -ne 0) { throw "7-Zip failed to unpack the installer (exit $LASTEXITCODE)." }
}

Write-Host 'Assembling the engine ...'
Remove-Item $engine -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $engine 'tessdata') | Out-Null

Copy-Item (Join-Path $unpacked 'tesseract.exe') $engine
foreach ($dll in $REQUIRED_DLLS) {
    $source = Join-Path $unpacked $dll
    if (-not (Test-Path $source)) {
        throw "Expected '$dll' in the Tesseract installer but it was missing. The upstream build layout may have changed."
    }
    Copy-Item $source $engine
}

# configs/ and tessconfigs/ hold the files named by the last Tesseract argument.
Copy-Item (Join-Path $unpacked 'tessdata/configs') (Join-Path $engine 'tessdata') -Recurse
Copy-Item (Join-Path $unpacked 'tessdata/tessconfigs') (Join-Path $engine 'tessdata') -Recurse
Copy-Item (Join-Path $unpacked 'tessdata/pdf.ttf') (Join-Path $engine 'tessdata')
# English ships inside the engine: Tesseract falls back to it, so an install
# without it is an engine that refuses every job.
Copy-Item (Join-Path $unpacked 'tessdata/eng.traineddata') (Join-Path $engine 'tessdata')

# Refuse to publish an engine that would be silently mute. "pdf" is a config
# file, not a format: without it a run exits 0 having written nothing at all.
if (-not (Test-Path (Join-Path $engine 'tessdata/configs/pdf'))) {
    throw 'Assembled engine has no tessdata/configs/pdf; OCR would produce no output.'
}

# Smoke test: an engine that cannot report its own version is not shippable.
$version = & (Join-Path $engine 'tesseract.exe') '--version' 2>&1 | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw "The assembled engine failed to run (exit $LASTEXITCODE)." }

Write-Host "Packing $archiveName ..."
Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
# Entry by entry, with separators normalised. Neither Compress-Archive nor
# ZipFile.CreateFromDirectory does this on Windows PowerShell 5.1: both emit
# "tessdata\configs\pdf", and the ZIP specification says entry names use '/'.
# Windows tolerates it, but a Linux reader creates one file with backslashes in
# its name instead of a directory tree, and the engine arrives without tessdata.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$engineRoot = (Resolve-Path $engine).Path.TrimEnd('\')
$zip = [System.IO.Compression.ZipFile]::Open(
    $archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem $engine -Recurse -File) {
        $entryName = $file.FullName.Substring($engineRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $file.FullName, $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

$codes = if ($AllLanguages) { Get-RemoteLanguageCodes } else { $Languages }
$languageEntries = [ordered]@{}
foreach ($code in $codes) {
    Write-Host "Hashing '$code' ..."
    $languageEntries[$code] = Get-LanguageEntry -Code $code -ScratchDir $models
}

Write-Host "Hashing 'osd' ..."
$osd = Get-LanguageEntry -Code 'osd' -ScratchDir $models
$osd['name'] = 'Orientation detection (auto-rotate)'

$manifest = [ordered]@{
    schemaVersion = 1
    engine        = [ordered]@{
        $PLATFORM_KEY = [ordered]@{
            url     = "$BaseUrl/$archiveName"
            size    = (Get-Item $archivePath).Length
            sha256  = Get-Sha256 $archivePath
            version = $ENGINE_VERSION
            name    = "Tesseract $ENGINE_VERSION"
        }
    }
    extras        = [ordered]@{ osd = $osd }
    languages     = $languageEntries
}

# Written through .NET, not Set-Content -Encoding utf8: on Windows PowerShell 5.1
# that emits a BOM, and a BOM in front of JSON is a parser's problem, not a
# reader's convenience.
[System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 6),
    (New-Object System.Text.UTF8Encoding($false)))

$archiveMb = (Get-Item $archivePath).Length / 1MB
Write-Host ''
Write-Host "Engine ready: $version"
Write-Host ("Archive:   {0} ({1:N1} MB)" -f $archivePath, $archiveMb)
Write-Host ("Manifest:  {0}" -f $manifestPath)
Write-Host ("Languages: {0} catalogued" -f $languageEntries.Count)
Write-Host ''
Write-Host 'Publish both files under the -BaseUrl above, then point'
Write-Host 'system.ocr.manifestUrl at the manifest.'
