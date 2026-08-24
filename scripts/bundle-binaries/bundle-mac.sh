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

# Pinned Deno release used as yt-dlp's JS runtime (--js-runtimes deno:...) so it
# can solve YouTube's JS challenges for age-restricted / signed content.
DENO_VERSION="v2.9.1"

# Oldest embedded yt-dlp we are willing to ship, as a release date.
#
# This is a floor, deliberately not an exact pin. YouTube breaks whichever player
# client yt-dlp defaults to every few weeks by demanding a PO token for it, and
# PyInstaller freezes yt-dlp into the scdl binary, so a shipped build can never
# be updated in place. Pinning an exact version would guarantee we ship a broken
# YouTube path the moment YouTube moves again.
#
# 2026.08.17 is the first build carrying the `visionos` player client, which
# replaced `android_vr` after YouTube started requiring a GVS PO token for it.
# Older builds 403 on every YouTube download.
YTDLP_MIN_VERSION="2026.08.17"

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
echo "[1/6] Creating Python venv..."
python3 -m venv "${VENV_DIR}"
PY="${VENV_DIR}/bin/python"

# 2. Install scdl (pulls yt-dlp), curl_cffi (browser impersonation), and PyInstaller.
echo ""
echo "[2/6] Installing scdl + curl_cffi + pyinstaller..."
"${PY}" -m pip install --upgrade pip
"${PY}" -m pip install scdl curl_cffi pyinstaller

# Upgrade yt-dlp explicitly and last, so it wins over the older release that
# scdl's dependency range resolves to. Letting yt-dlp arrive only as a
# transitive dependency is how builds silently shipped a months-old extractor.
# `--pre` tracks the nightly channel, which upstream recommends precisely because
# YouTube breaks extraction faster than stable releases go out.
echo ""
echo "Upgrading embedded yt-dlp to nightly..."
"${PY}" -m pip install --upgrade --pre 'yt-dlp[default]'

# 3. Build standalone scdl with yt-dlp collected in.
echo ""
echo "[3/6] Building scdl with PyInstaller..."
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
  --collect-all curl_cffi \
  --copy-metadata yt_dlp \
  --copy-metadata scdl \
  --copy-metadata curl_cffi \
  --runtime-hook "${SCRIPT_DIR}/pyi_rth_ytdlp_init.py" \
  --hidden-import yt_dlp.cookies \
  "${LAUNCHER}"

cp "${WORK_DIR}/dist/scdl" "${OUT_DIR}/scdl"
chmod +x "${OUT_DIR}/scdl"

# 4. Download static ffmpeg (evermeet.cx provides notarized macOS builds).
echo ""
echo "[4/6] Downloading static ffmpeg..."
FFMPEG_ZIP="${WORK_DIR}/ffmpeg.zip"
curl -L -o "${FFMPEG_ZIP}" 'https://evermeet.cx/ffmpeg/getrelease/zip'
unzip -o "${FFMPEG_ZIP}" -d "${WORK_DIR}/ffmpeg"
cp "${WORK_DIR}/ffmpeg/ffmpeg" "${OUT_DIR}/ffmpeg"
chmod +x "${OUT_DIR}/ffmpeg"

# 5. Download pinned Deno for the host arch — yt-dlp's JS runtime for YouTube.
echo ""
case "$(uname -m)" in
  arm64|aarch64) DENO_TARGET="aarch64-apple-darwin" ;;
  x86_64)        DENO_TARGET="x86_64-apple-darwin" ;;
  *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac
echo "[5/6] Downloading Deno ${DENO_VERSION} (${DENO_TARGET})..."
DENO_ZIP="${WORK_DIR}/deno.zip"
curl -L -o "${DENO_ZIP}" "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-${DENO_TARGET}.zip"
unzip -o "${DENO_ZIP}" -d "${WORK_DIR}/deno"
cp "${WORK_DIR}/deno/deno" "${OUT_DIR}/deno"
chmod +x "${OUT_DIR}/deno"

# 6. Smoke-test the bundled binary.
echo ""
echo "[6/6] Smoke-testing scdl..."
# --help only exercises arg parsing. The offline self-test (--pk-selftest)
# deterministically exercises the full scdl + yt_dlp import chain and the
# bundled scdl.cfg data file with no network access (a live download would
# depend on SoundCloud client-id scraping, which is flaky on CI).
if ! "${OUT_DIR}/scdl" --help >/dev/null 2>&1; then
  echo "scdl --help failed" >&2
  exit 1
fi

SELFTEST_OUT="$("${OUT_DIR}/scdl" --pk-selftest 2>&1 || true)"
if ! printf '%s' "${SELFTEST_OUT}" | grep -qF 'SELFTEST OK'; then
  printf '%s\n' "${SELFTEST_OUT}"
  echo "scdl self-test failed" >&2
  exit 1
fi
echo "scdl OK (import chain + bundled scdl.cfg verified)"

# Verify the embedded yt-dlp is reachable via the pk-ytdlp entry point (used for
# YouTube audio downloads).
if ! "${OUT_DIR}/scdl" pk-ytdlp --version >/dev/null 2>&1; then
  echo "scdl pk-ytdlp --version failed" >&2
  exit 1
fi
echo "scdl pk-ytdlp OK (embedded yt-dlp reachable)"

# Fail the build if the embedded yt-dlp predates the floor above. Without this
# the only symptom of a bad resolve is every YouTube download 403ing for users.
YTDLP_RAW="$("${OUT_DIR}/scdl" pk-ytdlp --version 2>&1 | head -n 1)"
YTDLP_VERSION="$(printf '%s' "${YTDLP_RAW}" | grep -oE '[0-9]{4}\.[0-9]{2}\.[0-9]{2}' | head -n 1)"
if [ -z "${YTDLP_VERSION}" ]; then
  echo "Could not parse embedded yt-dlp version from: ${YTDLP_RAW}" >&2
  exit 1
fi
# Zero-padded date components, so a plain lexicographic sort is chronological.
if [ "$(printf '%s\n%s\n' "${YTDLP_MIN_VERSION}" "${YTDLP_VERSION}" | sort | head -n 1)" != "${YTDLP_MIN_VERSION}" ]; then
  echo "Embedded yt-dlp ${YTDLP_VERSION} is older than the required ${YTDLP_MIN_VERSION}. YouTube downloads would fail with HTTP 403." >&2
  exit 1
fi
echo "embedded yt-dlp ${YTDLP_VERSION} meets the ${YTDLP_MIN_VERSION} floor"

# Verify the bundled Deno runs (also catches an arch mismatch early).
if ! "${OUT_DIR}/deno" --version >/dev/null 2>&1; then
  echo "deno --version failed" >&2
  exit 1
fi
echo "deno OK ($("${OUT_DIR}/deno" --version | head -n 1))"

echo ""
echo "Done. Binaries written to ${OUT_DIR}"
