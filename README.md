# PK-Tunez

EarthBound-inspired desktop companion for the [SCDL](https://github.com/scdl-org/scdl) SoundCloud downloader.

## Features

- SNES-era JRPG menu styling with PK-Tunez branding
- Batch artist/label downloads (`-t`, `-a`, `-f`, `-p`)
- Skip long mixes (60 min default, toggle off for full sets)
- 2-second delay between track requests to reduce SoundCloud rate limiting
- Global text archive dedup via `--download-archive` (survives moving files to a thumb drive)
- Persistent download history inventory with **Play** (opens default media player when file exists)
- Party Roster status sprites (Ness walking, peace sign, evil mushroom)
- Session-complete popup with looping jingle
- PSI Menu for SoundCloud credentials, filters, and troubleshooting tips

## Requirements

**For end users (packaged installer):** nothing extra — `scdl`, `yt-dlp`, and `ffmpeg` are bundled inside the app.

**For development:**

- Node.js 18+
- `scdl` available on PATH (the app falls back to a bundled binary when present, otherwise PATH)
- Optional: SoundCloud `client_id` (and `auth_token` for likes/private content)
- Optional: `pip install curl_cffi` for yt-dlp browser impersonation ([docs](https://github.com/yt-dlp/yt-dlp#impersonation))

## Development

```powershell
npm install
npm run dev
```

## Build (unpackaged)

```powershell
npm run build
npm run preview
```

## Packaging installers

PK-Tunez ships as a self-contained app: the `scdl` CLI (with `yt-dlp`) and `ffmpeg` are bundled as sidecar binaries so end users do not need Python or anything on PATH.

### 1. Bundle the sidecar binaries

These produce `resources/bin/<platform>/` and require Python 3.10+ and internet access.

```powershell
# Windows (run on Windows)
npm run bundle:binaries:win
```

```bash
# macOS (run on macOS)
npm run bundle:binaries:mac
```

### 2. Build the installer

```powershell
# Windows -> release/<version>/PK-Tunez-Windows-<version>-Setup.exe
npm run build:win
```

```bash
# macOS -> release/<version>/PK-Tunez-Mac-<version>-<arch>.dmg
npm run build:mac
```

`npm run build:unpack` produces an unpacked app directory (no installer) for quick local testing.

### Building macOS from Windows (or vice versa)

macOS apps cannot be built on Windows. Use the included GitHub Actions workflow
[.github/workflows/release.yml](.github/workflows/release.yml): push a `v*` tag or run it
manually from the Actions tab. It builds the Windows `.exe` and both macOS dmgs
(arm64 for Apple Silicon, x64 for Intel) and uploads them as artifacts.

### Code signing

Builds are unsigned, which is fine for personal sharing:

- **Windows:** SmartScreen may warn "Unknown publisher" — click *More info* -> *Run anyway*.
- **macOS:** Gatekeeper may block — right-click the app -> *Open*, or run `xattr -cr /Applications/PK-Tunez.app`.

## Installing (end users)

**Windows:** run `PK-Tunez-Windows-<version>-Setup.exe`, then launch PK-Tunez.

**macOS:** open the `.dmg` (arm64 for Apple Silicon, x64 for Intel Macs), drag PK-Tunez to Applications, then right-click -> *Open* on first launch.

Then open the **PSI Menu**, set a download folder, paste a SoundCloud URL, and press **PK DOWNLOAD!**.

## Data locations

App settings, history, and the global archive are stored per-user:

- **Windows:** `%APPDATA%\pk-tunez\`
- **macOS:** `~/Library/Application Support/pk-tunez/`

Files: `settings.json`, `history.json`, `download-archive.txt`. On first launch, PK-Tunez automatically migrates these from the older `scdl-earthbound-ui` folder if present.

## Usage

1. Open **PSI Menu** and set download folder (and credentials if needed).
2. Paste a SoundCloud profile or track URL into **Enter Psychic Signal**.
3. Choose a download mode (All Uploads is best for artist/label batches).
4. Press **PK DOWNLOAD!**

Tracks already recorded in the global archive are skipped automatically, even if the audio file was moved elsewhere.

## Sound effects

Custom sounds live in `src/renderer/src/assets/sfx/`:

| File | Plays when |
|------|------------|
| `ui-hover.wav` | Hovering any button |
| `ui-click.wav` | Pressing any button |
| `blip.wav` | Track skipped |
| `confirm.wav` | PK DOWNLOAD starts |
| `start.wav` | Track download begins |
| `complete.wav` | Single track finishes |
| `success.wav` | Settings saved and minor wins |
| `session-complete/*.wav` | Randomized rotation of session-complete popup jingles (loops until closed) |
| `error.wav` | Errors |

## Assets

- Logo: `src/renderer/src/assets/pktunez.png`
- Window icon: `resources/icon.png`
- Sprites: `src/renderer/src/assets/sprites/`
- Session-complete jingles: `src/renderer/src/assets/sfx/session-complete/` (`.wav` or `.mp3`; each session picks one at random until all have played, then shuffles again)

## Troubleshooting

**HTTP 429 (Too Many Requests):** SoundCloud is rate-limiting. Wait several minutes, download smaller batches, or keep the built-in 2-second delay enabled.

**Impersonation warning:** Usually harmless. Install `curl_cffi` if downloads fail. PK-Tunez shows a one-time tip when this warning appears.
