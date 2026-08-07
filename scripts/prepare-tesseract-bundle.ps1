<#
.SYNOPSIS
    Prepares the Tesseract runtime bundled with the Windows desktop build.

.DESCRIPTION
    Stirling-PDF shells out to a `tesseract` executable, which the Windows
    installer has never shipped: users had to install Tesseract themselves and
    point settings.yml at it, and the desktop app could not OCR at all in
    local-only mode. This script produces a self-contained Tesseract runtime
    that the Tauri bundler drops next to the application, so a fresh install can
    OCR without any external dependency or network access.

    The binaries come from the UB Mannheim build, the reference Windows
    distribution of Tesseract (Apache-2.0, redistributable). Its installer is an
    NSIS archive, so 7-Zip can unpack it without running it. Language models
    come from tessdata_fast, which is what Stirling-PDF uses by default.

    Only the files the OCR paths actually need are kept. The set of DLLs below
    was derived empirically by removing each one and re-running OCR: everything
    listed is required for `tesseract <img> <out> pdf` or `--psm 0` (orientation
    detection) to succeed. Training tools, and the Pango/Cairo/ICU stack they
    drag in, are dropped: they account for well over half of the payload and no
    Stirling-PDF code path invokes them.

    Nothing produced here is committed. The output directory is git-ignored and
    rebuilt on demand, so the repository never carries ~130 MB of binaries.

.PARAMETER OutputDir
    Where to place the bundle. Defaults to the location the Tauri config
    references, frontend/editor/src-tauri/tesseract.

.PARAMETER Languages
    Language models to fetch from tessdata_fast, additional to the English and
    OSD models that ship inside the installer. Defaults to Spanish.

.PARAMETER Force
    Rebuild even when the output directory already looks complete.

.EXAMPLE
    ./scripts/prepare-tesseract-bundle.ps1
    ./scripts/prepare-tesseract-bundle.ps1 -Languages spa,fra,deu
#>
[CmdletBinding()]
param(
    [string] $OutputDir,
    [string[]] $Languages = @('spa'),
    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$TESSERACT_VERSION = '5.4.0.20240606'
$INSTALLER_URL = "https://github.com/UB-Mannheim/tesseract/releases/download/v$TESSERACT_VERSION/tesseract-ocr-w64-setup-$TESSERACT_VERSION.exe"
$TESSDATA_FAST_URL = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main'

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

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot 'frontend/editor/src-tauri/tesseract'
}

# A bundle is only usable with the executable, every DLL, the config files Tesseract
# reads to select an output format, and every language that was asked for. Leaving the
# languages out of this check made -Languages silently useless once a bundle existed:
# adding a language to an existing build exited early and downloaded nothing.
$alreadyBuilt = (Test-Path (Join-Path $OutputDir 'tesseract.exe')) -and
                (Test-Path (Join-Path $OutputDir 'tessdata/configs/pdf')) -and
                -not ($REQUIRED_DLLS | Where-Object { -not (Test-Path (Join-Path $OutputDir $_)) }) -and
                -not ($Languages | Where-Object {
                    -not (Test-Path (Join-Path $OutputDir "tessdata/$_.traineddata"))
                })
if ($alreadyBuilt -and -not $Force) {
    Write-Host "Tesseract bundle already present at $OutputDir (use -Force to rebuild)."
    exit 0
}

$sevenZip = Find-SevenZip
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "stirling-tesseract-$TESSERACT_VERSION"
$installer = Join-Path $staging 'installer.exe'
$unpacked = Join-Path $staging 'unpacked'

try {
    New-Item -ItemType Directory -Force $staging | Out-Null

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

    Write-Host "Assembling bundle in $OutputDir ..."
    Remove-Item $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force (Join-Path $OutputDir 'tessdata') | Out-Null

    Copy-Item (Join-Path $unpacked 'tesseract.exe') $OutputDir
    foreach ($dll in $REQUIRED_DLLS) {
        $source = Join-Path $unpacked $dll
        if (-not (Test-Path $source)) {
            throw "Expected '$dll' in the Tesseract installer but it was missing. The upstream build layout may have changed."
        }
        Copy-Item $source $OutputDir
    }

    # configs/ holds the output-format files ("pdf", "hocr") passed as the last
    # Tesseract argument; without them OCR fails with "Can't open pdf".
    Copy-Item (Join-Path $unpacked 'tessdata/configs') (Join-Path $OutputDir 'tessdata') -Recurse
    Copy-Item (Join-Path $unpacked 'tessdata/tessconfigs') (Join-Path $OutputDir 'tessdata') -Recurse
    Copy-Item (Join-Path $unpacked 'tessdata/pdf.ttf') (Join-Path $OutputDir 'tessdata')
    # eng is mandatory for Stirling-PDF; osd backs the auto-rotate endpoint.
    Copy-Item (Join-Path $unpacked 'tessdata/eng.traineddata') (Join-Path $OutputDir 'tessdata')
    Copy-Item (Join-Path $unpacked 'tessdata/osd.traineddata') (Join-Path $OutputDir 'tessdata')

    foreach ($language in $Languages) {
        if ($language -in @('eng', 'osd')) { continue }
        Write-Host "Fetching '$language' language model ..."
        Invoke-WebRequest -Uri "$TESSDATA_FAST_URL/$language.traineddata" `
            -OutFile (Join-Path $OutputDir "tessdata/$language.traineddata") -UseBasicParsing
    }

    # Smoke test: a bundle that cannot report its own version is not shippable.
    $version = & (Join-Path $OutputDir 'tesseract.exe') '--version' 2>&1 | Select-Object -First 1
    if ($LASTEXITCODE -ne 0) { throw "The assembled bundle failed to run (exit $LASTEXITCODE)." }

    $sizeMb = (Get-ChildItem $OutputDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
    Write-Host ''
    Write-Host "Bundle ready: $version"
    Write-Host ("Location: {0}" -f $OutputDir)
    Write-Host ("Size: {0:N1} MB" -f $sizeMb)
    Write-Host ("Languages: {0}" -f ((Get-ChildItem (Join-Path $OutputDir 'tessdata') -Filter '*.traineddata' |
        ForEach-Object { $_.BaseName }) -join ', '))
}
finally {
    # The unpacked installer is kept so repeat runs skip the 48 MB download.
    Write-Verbose "Staging directory retained at $staging"
}
