# macOS sidecar binaries

This folder is bundled into the macOS app at `Contents/Resources/bin/`.

Populate it by running (on macOS or CI):

```bash
npm run bundle:binaries:mac
```

Expected contents after bundling:

- `scdl` — SoundCloud downloader CLI (PyInstaller one-file build)
- `ffmpeg` — static FFmpeg build
- `yt-dlp` — only if scdl does not embed yt-dlp

These files are intentionally not committed to git (see `.gitignore`).
