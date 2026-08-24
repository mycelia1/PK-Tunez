<#
.SYNOPSIS
  Builds the bundled Windows sidecar binaries for PK-Tunez.

.DESCRIPTION
  Produces a standalone scdl.exe (with yt-dlp embedded) via PyInstaller and
  downloads a static ffmpeg.exe, then copies both into resources/bin/win32.

.REQUIREMENTS
  - Python 3.10+ on PATH (python --version)
  - Internet access (pip + ffmpeg download)
#>

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$outDir = Join-Path $projectRoot 'resources\bin\win32'
$workDir = Join-Path $env:TEMP "pk-tunez-bundle-$(Get-Random)"
$venvDir = Join-Path $workDir 'venv'
$launcher = Join-Path $scriptDir 'scdl_launcher.py'

# Pinned Deno release used as yt-dlp's JS runtime (--js-runtimes deno:...) so it
# can solve YouTube's JS challenges for age-restricted / signed content.
$denoVersion = 'v2.9.1'

# Oldest embedded yt-dlp we are willing to ship, as a release date.
#
# This is a floor, deliberately not an exact pin. YouTube breaks whichever player
# client yt-dlp defaults to every few weeks by demanding a PO token for it, and
# PyInstaller freezes yt-dlp into scdl.exe, so a shipped build can never be
# updated in place. Pinning an exact version would guarantee we ship a broken
# YouTube path the moment YouTube moves again.
#
# 2026.08.17 is the first build carrying the `visionos` player client, which
# replaced `android_vr` after YouTube started requiring a GVS PO token for it.
# Older builds 403 on every YouTube download.
$ytDlpMinVersion = '2026.08.17'

Write-Host "PK-Tunez Windows binary bundler"
Write-Host "  project root: $projectRoot"
Write-Host "  work dir:     $workDir"
Write-Host "  output:       $outDir"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 1. Create an isolated virtual environment.
Write-Host "`n[1/6] Creating Python venv..."
python -m venv $venvDir
$py = Join-Path $venvDir 'Scripts\python.exe'

# 2. Install scdl (pulls yt-dlp), curl_cffi (browser impersonation), and PyInstaller.
Write-Host "`n[2/6] Installing scdl + curl_cffi + pyinstaller..."
& $py -m pip install --upgrade pip
& $py -m pip install scdl curl_cffi pyinstaller

# Upgrade yt-dlp explicitly and last, so it wins over the older release that
# scdl's dependency range resolves to. Letting yt-dlp arrive only as a
# transitive dependency is how builds silently shipped a months-old extractor.
# `--pre` tracks the nightly channel, which upstream recommends precisely because
# YouTube breaks extraction faster than stable releases go out.
Write-Host "`nUpgrading embedded yt-dlp to nightly..."
& $py -m pip install --upgrade --pre 'yt-dlp[default]'

# 3. Build standalone scdl.exe with yt-dlp collected in.
Write-Host "`n[3/6] Building scdl.exe with PyInstaller..."
& $py -m PyInstaller `
    --onefile `
    --name scdl `
    --distpath (Join-Path $workDir 'dist') `
    --workpath (Join-Path $workDir 'build') `
    --specpath $workDir `
    --collect-submodules yt_dlp `
    --collect-submodules scdl `
    --collect-data scdl `
    --collect-all mutagen `
    --collect-all curl_cffi `
    --copy-metadata yt_dlp `
    --copy-metadata scdl `
    --copy-metadata curl_cffi `
    --runtime-hook (Join-Path $scriptDir 'pyi_rth_ytdlp_init.py') `
    --hidden-import yt_dlp.cookies `
    $launcher

Copy-Item (Join-Path $workDir 'dist\scdl.exe') (Join-Path $outDir 'scdl.exe') -Force

# 4. Download static ffmpeg.
Write-Host "`n[4/6] Downloading static ffmpeg..."
$ffmpegZip = Join-Path $workDir 'ffmpeg.zip'
$ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip
$ffmpegExtract = Join-Path $workDir 'ffmpeg'
Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtract -Force
$ffmpegExe = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
Copy-Item $ffmpegExe.FullName (Join-Path $outDir 'ffmpeg.exe') -Force

# 5. Download pinned Deno (x64) — yt-dlp's JS runtime for YouTube challenges.
Write-Host "`n[5/6] Downloading Deno $denoVersion (x64)..."
$denoZip = Join-Path $workDir 'deno.zip'
$denoUrl = "https://github.com/denoland/deno/releases/download/$denoVersion/deno-x86_64-pc-windows-msvc.zip"
Invoke-WebRequest -Uri $denoUrl -OutFile $denoZip
$denoExtract = Join-Path $workDir 'deno'
Expand-Archive -Path $denoZip -DestinationPath $denoExtract -Force
$denoExe = Get-ChildItem -Path $denoExtract -Recurse -Filter 'deno.exe' | Select-Object -First 1
Copy-Item $denoExe.FullName (Join-Path $outDir 'deno.exe') -Force

# 6. Smoke-test the bundled binary.
#    --help only exercises arg parsing. The offline self-test (--pk-selftest)
#    deterministically exercises the full scdl + yt_dlp import chain and the
#    bundled scdl.cfg data file with no network access (a live download would
#    depend on SoundCloud client-id scraping, which is flaky on CI).
Write-Host "`n[6/6] Smoke-testing scdl.exe..."
$scdlExe = Join-Path $outDir 'scdl.exe'

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

& $scdlExe --help 2>&1 | Out-Null
$helpExit = $LASTEXITCODE

$selfTestOut = (& $scdlExe --pk-selftest 2>&1 | Out-String)
$selfTestExit = $LASTEXITCODE

$ErrorActionPreference = $prevEAP

if ($helpExit -ne 0) {
  throw "scdl.exe --help failed with exit code $helpExit"
}
if ($selfTestExit -ne 0 -or ($selfTestOut -notmatch 'SELFTEST OK')) {
  Write-Host $selfTestOut
  throw "scdl.exe self-test failed (exit $selfTestExit)"
}
Write-Host "scdl.exe OK (import chain + bundled scdl.cfg verified)"

# Verify the embedded yt-dlp is reachable via the pk-ytdlp entry point (used for
# YouTube audio downloads).
$ErrorActionPreference = 'Continue'
$ytdlpOut = (& $scdlExe pk-ytdlp --version 2>&1 | Out-String)
$ytdlpExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($ytdlpExit -ne 0) {
  Write-Host $ytdlpOut
  throw "scdl.exe pk-ytdlp --version failed (exit $ytdlpExit)"
}
Write-Host "scdl.exe pk-ytdlp OK (embedded yt-dlp reachable: $($ytdlpOut.Trim()))"

# Fail the build if the embedded yt-dlp predates the floor above. Without this
# the only symptom of a bad resolve is every YouTube download 403ing for users.
# Matches the date prefix only, so a nightly's trailing build number (e.g.
# 2026.08.17.073947) compares equal to the same day's floor rather than above it.
$ytDlpVersionMatch = [regex]::Match($ytdlpOut, '\d{4}\.\d{2}\.\d{2}')
if (-not $ytDlpVersionMatch.Success) {
  throw "Could not parse embedded yt-dlp version from: $($ytdlpOut.Trim())"
}
# Date components are zero-padded, so string comparison is chronological.
$ytDlpVersion = $ytDlpVersionMatch.Value
if ($ytDlpVersion -lt $ytDlpMinVersion) {
  throw "Embedded yt-dlp $ytDlpVersion is older than the required $ytDlpMinVersion. YouTube downloads would fail with HTTP 403."
}
Write-Host "embedded yt-dlp $ytDlpVersion meets the $ytDlpMinVersion floor"

# Verify the bundled Deno runs (also catches an arch mismatch early).
$ErrorActionPreference = 'Continue'
$denoOut = (& (Join-Path $outDir 'deno.exe') --version 2>&1 | Out-String)
$denoExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($denoExit -ne 0) {
  Write-Host $denoOut
  throw "deno.exe --version failed (exit $denoExit)"
}
Write-Host "deno.exe OK ($(($denoOut -split "`n")[0].Trim()))"

Write-Host "`nDone. Binaries written to $outDir"
Write-Host "Cleaning up work dir..."
Remove-Item -Recurse -Force $workDir
