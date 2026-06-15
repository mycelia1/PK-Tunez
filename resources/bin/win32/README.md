# Windows sidecar binaries

This folder is bundled into the Windows installer at `resources/bin/` inside the app.

Populate it by running:

```powershell
npm run bundle:binaries:win
```

Expected contents after bundling:

- `scdl.exe` — SoundCloud downloader CLI (PyInstaller one-file build)
- `ffmpeg.exe` — static FFmpeg build
- `yt-dlp.exe` — only if scdl does not embed yt-dlp

These files are intentionally not committed to git (see `.gitignore`).
