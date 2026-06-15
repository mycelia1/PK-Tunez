#!/usr/bin/env bash
#
# Builds the bundled macOS sidecar binaries for PK-Tunez.
#
# Produces a standalone `scdl` (with yt-dlp embedded) via PyInstaller and
# downloads a static `ffmpeg`, then copies both into resources/bin/darwin.
#
# Requirements:
#   - Python 3.10+ on PATH (python3 --version)
#   - Internet access (pip + ffmpeg download)
#
# Note: PyInstaller builds for the host architecture. Run on Apple Silicon for
# an arm64 binary and on Intel for x64. CI uses a matrix to cover both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${PROJECT_ROOT}/resources/bin/darwin"
WORK_DIR="$(mktemp -d -t pk-tunez-bundle-XXXXXX)"
VENV_DIR="${WORK_DIR}/venv"
LAUNCHER="${SCRIPT_DIR}/scdl_launcher.py"

echo "PK-Tunez macOS binary bundler"
echo "  project root: ${PROJECT_ROOT}"
echo "  work dir:     ${WORK_DIR}"
echo "  output:       ${OUT_DIR}"
echo "  arch:         $(uname -m)"

mkdir -p "${OUT_DIR}"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

# 1. Create an isolated virtual environment.
echo ""
echo "[1/5] Creating Python venv..."
python3 -m venv "${VENV_DIR}"
PY="${VENV_DIR}/bin/python"

# 2. Install scdl (pulls yt-dlp) and PyInstaller.
echo ""
echo "[2/5] Installing scdl + pyinstaller..."
"${PY}" -m pip install --upgrade pip
"${PY}" -m pip install scdl pyinstaller

# 3. Build standalone scdl with yt-dlp collected in.
echo ""
echo "[3/5] Building scdl with PyInstaller..."
"${PY}" -m PyInstaller \
  --onefile \
  --name scdl \
  --distpath "${WORK_DIR}/dist" \
  --workpath "${WORK_DIR}/build" \
  --specpath "${WORK_DIR}" \
  --collect-submodules yt_dlp \
  --collect-submodules scdl \
  --collect-data scdl \
  --collect-all mutagen \
  --copy-metadata yt_dlp \
  --copy-metadata scdl \
  --runtime-hook "${SCRIPT_DIR}/pyi_rth_ytdlp_init.py" \
  --hidden-import yt_dlp.cookies \
  "${LAUNCHER}"

cp "${WORK_DIR}/dist/scdl" "${OUT_DIR}/scdl"
chmod +x "${OUT_DIR}/scdl"

# 4. Download static ffmpeg (evermeet.cx provides notarized macOS builds).
echo ""
echo "[4/5] Downloading static ffmpeg..."
FFMPEG_ZIP="${WORK_DIR}/ffmpeg.zip"
curl -L -o "${FFMPEG_ZIP}" 'https://evermeet.cx/ffmpeg/getrelease/zip'
unzip -o "${FFMPEG_ZIP}" -d "${WORK_DIR}/ffmpeg"
cp "${WORK_DIR}/ffmpeg/ffmpeg" "${OUT_DIR}/ffmpeg"
chmod +x "${OUT_DIR}/ffmpeg"

# 5. Smoke-test the bundled binary.
echo ""
echo "[5/5] Smoke-testing scdl..."
# --help only exercises arg parsing; also run a real invocation so config
# loading (scdl.cfg) and the yt_dlp/scdl import chain are exercised.
if ! "${OUT_DIR}/scdl" --help >/dev/null 2>&1; then
  echo "scdl --help failed" >&2
  exit 1
fi

# A bogus URL fails fast on the network side, but only AFTER scdl loads its
# config and the full import chain - which is exactly what crashed before.
RUN_OUT="$("${OUT_DIR}/scdl" -l 'https://soundcloud.com/pk-tunez-smoke-test/does-not-exist' 2>&1 || true)"
for marker in 'Failed to execute script' 'scdl.cfg' 'No such file or directory' 'ModuleNotFoundError' 'Traceback (most recent call last)'; do
  if printf '%s' "${RUN_OUT}" | grep -qF "${marker}"; then
    printf '%s\n' "${RUN_OUT}"
    echo "scdl smoke test detected a packaging failure (matched: '${marker}')" >&2
    exit 1
  fi
done
echo "scdl OK (help + config load verified)"

echo ""
echo "Done. Binaries written to ${OUT_DIR}"
