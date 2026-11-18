# ChordDemo

A bare-bones Chordify-style demo: a YouTube player, chords on a beat grid, synced lyrics, and a capo setting.

## How it works

- **Phone/web page** (`index.html`): static HTML, CSS and JS with no build step. It plays the song in the YouTube IFrame player and polls the playback time to highlight the current beat, chord and lyric line.
- **Analyser** (`analyzer/analyze.py`, runs on the PC): downloads the audio once with yt-dlp into a temp folder, then runs:
  - **Beat This!** (JKU, ISMIR 2024) for beats and downbeats
  - **BTC** (ISMIR 2019, large vocabulary) for chords, snapped to beats

  It then writes `songs/<videoId>.json` and deletes the audio. Lyrics are **not** stored, because the repo is public. The page fetches synced lyrics live from **LRCLIB**.
- Songs that haven't been analysed still play, with lyrics only. The page looks the lyrics up on LRCLIB from the video title.

## Use it

- **Live site:** https://zarleyltd.github.io/ChordDemo/ (GitHub Pages from `main`).
- **Add a song (on the PC):**
  ```
  analyzer\analyze.bat https://www.youtube.com/watch?v=XXXXXXXXXXX
  ```
  This analyses the song, then commits and pushes `songs/`. The site updates about a minute later. Use `analyze.bat --no-push <url>` to analyse without publishing.
- **Local testing:** run `start-demo.bat`, then open http://localhost:3000. Open it in a real browser, not an editor preview, or YouTube refuses to play.

## Installable app

This uses the Edison-style installable app pattern: `manifest.json`, `sw.js` (network-first, so the cache is only the offline fallback), and icons in `assets/icons/`. Whenever you add a JS or CSS file to the page, add it to `SHELL` in `sw.js` and bump `CACHE` (for example `chorddemo-shell-v2`).

## YouTube ads

During an ad, the IFrame player reports `UNSTARTED` (-1) while `getCurrentTime()` runs on the ad's clock. The page treats that as "ad playing": it freezes the chords and lyrics, and it keeps any tapped seek until the song starts. Ads in the middle of a song haven't been tested yet. `ChordDemoDebug()` in the browser console shows the player state.

## First-time analyser setup

The setup is already done on this PC. To set it up again:

```
cd analyzer
python -m venv .venv
.venv\Scripts\pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\pip install beat-this "yt-dlp[default]" librosa imageio-ffmpeg requests pyyaml mir_eval truststore
git clone --depth 1 https://github.com/jayg996/BTC-ISMIR19 vendor/BTC
```

Behind Avast HTTPS scanning, add `--cert "C:\ProgramData\Avast Software\Avast\wscert.pem"` to the pip commands.

## Notes

- Downloading YouTube audio is against YouTube's terms of service. This demo is for personal use only.
- Chord accuracy is roughly Chordify-level: usually right on major and minor chords, weaker on 7ths and extended chords. "Simple chords" reduces every chord to major or minor.
- Settings (capo, lyric offset) are saved per song in the browser.
