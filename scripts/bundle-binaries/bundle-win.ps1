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

Write-Host "PK-Tunez Windows binary bundler"
Write-Host "  project root: $projectRoot"
Write-Host "  work dir:     $workDir"
Write-Host "  output:       $outDir"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 1. Create an isolated virtual environment.
Write-Host "`n[1/5] Creating Python venv..."
python -m venv $venvDir
$py = Join-Path $venvDir 'Scripts\python.exe'

# 2. Install scdl (pulls yt-dlp), curl_cffi (browser impersonation), and PyInstaller.
Write-Host "`n[2/5] Installing scdl + curl_cffi + pyinstaller..."
& $py -m pip install --upgrade pip
& $py -m pip install scdl curl_cffi pyinstaller

# 3. Build standalone scdl.exe with yt-dlp collected in.
Write-Host "`n[3/5] Building scdl.exe with PyInstaller..."
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
Write-Host "`n[4/5] Downloading static ffmpeg..."
$ffmpegZip = Join-Path $workDir 'ffmpeg.zip'
$ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip
$ffmpegExtract = Join-Path $workDir 'ffmpeg'
Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtract -Force
$ffmpegExe = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
Copy-Item $ffmpegExe.FullName (Join-Path $outDir 'ffmpeg.exe') -Force

# 5. Smoke-test the bundled binary.
#    --help only exercises arg parsing. The offline self-test (--pk-selftest)
#    deterministically exercises the full scdl + yt_dlp import chain and the
#    bundled scdl.cfg data file with no network access (a live download would
#    depend on SoundCloud client-id scraping, which is flaky on CI).
Write-Host "`n[5/5] Smoke-testing scdl.exe..."
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

Write-Host "`nDone. Binaries written to $outDir"
Write-Host "Cleaning up work dir..."
Remove-Item -Recurse -Force $workDir
