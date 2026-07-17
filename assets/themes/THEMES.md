# PK-Tunez themes — drop-in asset guide

The UI supports two themes: **earthbound** (default) and **dk64**.

Toggle in **PSI Menu / Cranky's Menu → Theme**. Colors and copy swap immediately; images/SFX appear as soon as you drop files in the folders below and restart the app (or re-run `npm run dev`).

---

## EarthBound (already shipped)

| Kind | Location |
|------|----------|
| Logo | `assets/images/pktunez.png` |
| Sprites | `assets/images/sprites/nesswalking.gif`, `nesspeacesign.webp`, `struttinevilmushroom1.webp` |
| Core SFX | `src/renderer/src/assets/sfx/*.wav` |
| Session-complete music | `src/renderer/src/assets/sfx/session-complete/*.{wav,mp3}` |

---

## Donkey Kong 64 — files to add

Until these exist, DK64 **falls back** to EarthBound sprites/logo and EarthBound UI SFX. Session-complete music falls back to a short synth sting (not EarthBound OST).

### Images — `assets/themes/dk64/`

| Filename (stem) | Used for | Notes |
|-----------------|----------|--------|
| `logo.png` (or `.webp`) | Title wordmark (replaces “PK-Tunez” text) | Wide wordmark preferred |
| `wallpaper.jpg` (or `.png`/`.webp`) | Repeating page background | Tiled at native size |
| `mix-lab.png` (or `.webp`/`.gif`) | Cranky Lab / Mix Lab header | Replaces section title text |
| `backpack.png` (or `.webp`/`.gif`) | Banana Hoard / Backpack header | Replaces section title text |
| `banana-barrel.png` (or `.webp`/`.gif`) | Banana Barrel / queue header | Replaces section title text |
| `downloading.gif` (or `.webp`) | Queue “in progress” sprite | Animated preferred |
| `complete.webp` (or `.png`/`.gif`) | Queue success / already owned | Victory pose |
| `error.webp` (or `.png`/`.gif`) | Queue error | Enemy / fail sprite |

Any extension among `png`, `webp`, `gif`, `jpg`, `jpeg` works — matching is by **filename stem**.

Optional later:

- `assets/themes/dk64/fonts/` — custom heading/body fonts (wire into `src/renderer/src/theme/variables.css` under `[data-theme='dk64']`)
- App icon is build-time only: `assets/icons/icon.png` (not hot-swappable per theme)

### Core SFX — `src/renderer/src/assets/sfx/dk64/`

| Filename | Trigger |
|----------|---------|
| `ui-hover.wav` | Button hover |
| `ui-click.wav` | Button click |
| `blip.wav` | Track skipped |
| `confirm.wav` | Download started |
| `start.wav` | Track starts |
| `complete.wav` | Track finished |
| `success.wav` | Settings saved / success |
| `error.wav` | Errors |

`.mp3` also accepted. Missing files fall back to the EarthBound WAVs.

### Session-complete music — `src/renderer/src/assets/sfx/dk64/session-complete/`

Drop any number of `.wav` / `.mp3` tracks. One is picked at random (shuffled queue) and loops until the session-complete modal closes.

---

## Copy & colors (no assets needed)

| Concern | File |
|---------|------|
| UI strings per theme | `src/renderer/src/theme/themes.ts` → `THEME_COPY` |
| Palette / fonts / radii | `src/renderer/src/theme/variables.css` → `[data-theme='dk64']` |
| Window splash color | `src/main/index.ts` → `THEME_WINDOW_BG` |

After adding image/SFX files, restart the Vite/Electron process so `import.meta.glob` picks them up.
