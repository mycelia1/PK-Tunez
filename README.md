# PK-Tunez

EarthBound-inspired desktop companion for the [SCDL](https://github.com/scdl-org/scdl) SoundCloud downloader.

## Features

- SNES-era JRPG menu styling with PK-Tunez branding
- Batch artist/label downloads (`-t`, `-a`, `-f`, `-p`)
- Skip long mixes (60 min default, toggle off for full sets)
- Throttle protection: chunked batches with cooldowns, jittered per-track delays, and automatic 403/429 backoff + resume
- Optional browser impersonation (bundled `curl_cffi`) and download rate limiting
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
- Optional: SoundCloud credentials in the PSI Menu — see [SoundCloud credentials](#soundcloud-credentials-psi-menu) (auth token required for Likes; client ID usually auto-detected)
- Optional: `pip install curl_cffi` for yt-dlp browser impersonation ([docs](https://github.com/yt-dlp/yt-dlp#impersonation)). The packaged installer bundles this already; you only need it for dev runs that use the impersonation toggle.

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
(arm64 for Apple Silicon, x64 for Intel) and publishes them to
[GitHub Releases](https://github.com/mycelia1/PK-Tunez/releases).

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

## SoundCloud credentials (PSI Menu)

PK-Tunez passes optional credentials to `scdl` / `yt-dlp`. Both fields are **optional for public tracks**; you only need them for certain download modes or when downloads start failing.

### Do you need them?

| Field | Required when | Why |
|-------|-------------|-----|
| **Client ID** | Usually **no** | `yt-dlp` discovers and caches a SoundCloud client ID automatically. PK-Tunez works without one for most public artist/track downloads. |
| **Auth token** | **Likes** mode, private tracks, some GO+ / original-quality downloads | Proves you are logged in as your SoundCloud account. |

### Client ID — what it is and when to set it

SoundCloud’s API expects a `client_id` on every request (rate limiting and app identification). `yt-dlp` normally **extracts one from SoundCloud’s website and caches it** on your machine, which is why PK-Tunez often works with the field left blank.

Set a **Client ID** in the PSI Menu if:

- Public downloads suddenly fail with API or metadata errors (the cached ID may be stale or rate-limited).
- You want to override the auto-detected ID with a fresh one from your browser.

**How to find a client ID**

1. Log in to [soundcloud.com](https://soundcloud.com) in your browser.
2. Open Developer Tools (`F12`) → **Network** tab.
3. Play a track or refresh the page. Filter for `api-v2.soundcloud.com`.
4. Open any request and look for `client_id=` in the URL query string (or request params).
5. Copy that value into **Client ID** in the PSI Menu and save.

Client IDs can change or get throttled over time; if downloads break again, grab a fresh one.

### Auth token — what it is and when to set it

The auth token is your SoundCloud **OAuth token** — it tells the API which account you are. PK-Tunez sends it as `--auth-token` to `scdl`.

You **need** it for:

- **Likes** download mode (your favorited tracks).
- **Private** tracks your account can access.
- **Original / lossless** files when the uploader enabled downloads (per [scdl docs](https://github.com/scdl-org/scdl/wiki/Installation-Instruction)).
- Some **SoundCloud Go+** content and higher-quality streams your subscription allows.

You do **not** need it for typical public artist uploads, reposts, or playlists.

**How to find your auth token**

1. Log in to [soundcloud.com](https://soundcloud.com) in your browser.
2. Open Developer Tools (`F12`).
3. **Chrome / Edge:** **Application** tab → **Storage** → **Cookies** → `https://soundcloud.com`.
4. **Firefox:** **Storage** tab → **Cookies** → `https://soundcloud.com`.
5. Find the cookie named **`oauth_token`** and copy its **Value**.
6. Paste into **Auth Token** in the PSI Menu and click **Save PSI Settings**.

Alternative: in the **Network** tab, click a request to `api-v2.soundcloud.com` and copy the token from the `Authorization` header (the part after `OAuth `).

**Security:** Your token is stored locally in `settings.json` under your PK-Tunez app data folder. It is equivalent to staying logged in — do not share it or commit it to git. If it leaks, log out of SoundCloud everywhere or change your password to invalidate sessions, then grab a new token.

## Throttle protection (PSI Menu)

SoundCloud rate-limits bulk downloads and may start returning **HTTP 403/429** after a few dozen tracks. PK-Tunez has several knobs (all in the PSI Menu) to avoid and recover from this:

| Setting | Default | What it does |
|---------|---------|--------------|
| **Chunk Size** | 25 | Downloads this many tracks, then pauses for a cooldown before continuing. `0` disables chunking. Re-runs skip finished tracks via the global archive, so each chunk is an effective resume. |
| **Chunk Cooldown** | 120s | How long to wait between chunks. |
| **Max Throttle Retries** | 5 | After a 403/429 is detected, PK-Tunez waits (exponential backoff: 30s → 60s → 120s …) and resumes, up to this many attempts. |
| **Sleep Between Tracks (min/max)** | 3–8s | Randomized (jittered) delay between tracks. Jitter looks less bot-like than a fixed wait. |
| **Sleep Between Requests** | 1.5s | Spaces out the API/metadata requests that usually trip throttling (yt-dlp `--sleep-requests`). |
| **Limit Download Rate** | off | Caps bandwidth per download (e.g. `2M`, `500K`). Helps you blend in; it is *not* a direct throttle fix since throttling is driven by request frequency, not bandwidth. |
| **Browser Impersonation** | off | Makes yt-dlp mimic a real Chrome TLS/HTTP fingerprint (`--impersonate chrome`) to reduce bot detection. Requires `curl_cffi`, which is bundled in the installed app. |

**Tips if you still get throttled:**

- Lower the chunk size and/or raise the cooldown.
- Drop the **auth token** for public artist/label batches — using it ties throttling (and any flags) to your real account.
- Enable browser impersonation.

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

Graphic assets live under `assets/`:

- App / window icon: `assets/icons/icon.png`
- Logo: `assets/images/pktunez.png`
- Sprites: `assets/images/sprites/`

Sound effects stay with the renderer bundle in `src/renderer/src/assets/sfx/`:

- Session-complete jingles: `src/renderer/src/assets/sfx/session-complete/` (`.wav` or `.mp3`; each session picks one at random until all have played, then shuffles again)

Bundled sidecar binaries (scdl, ffmpeg, yt-dlp) are built into `resources/bin/` at release time.

## Troubleshooting

**HTTP 403 / 429 (throttling):** SoundCloud is rate-limiting. PK-Tunez automatically backs off and resumes (see [Throttle protection](#throttle-protection-psi-menu)). If it keeps happening, lower the chunk size, raise the cooldown, drop the auth token for public batches, or enable browser impersonation.

**Impersonation warning:** Usually harmless. Install `curl_cffi` if downloads fail. PK-Tunez shows a one-time tip when this warning appears.
