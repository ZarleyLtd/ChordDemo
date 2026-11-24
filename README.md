# ChordDemo

A bare-bones Chordify-style demo: a YouTube player, chords on a beat grid, synced lyrics, and a capo setting.

## How it works

- **Phone/web page** (`index.html`): static HTML, CSS and JS with no build step. It plays the song in the YouTube IFrame player and polls the playback time to highlight the current beat, chord and lyric line.
- **Analyser** (`analyzer/analyze.py`, runs on the PC): downloads the audio once with yt-dlp into a temp folder, then runs:
  - **Beat This!** (JKU, ISMIR 2024) for beats and downbeats
  - **BTC** (ISMIR 2019, large vocabulary) for chords, snapped to beats

  It then saves the song to the library and deletes the audio. Lyrics are **not** stored. The page fetches synced lyrics live from **LRCLIB**.
- **Song library** (Supabase): songs live in the `chorddemo.songs` table on the shared CursorSites **Apps** project. The page reads them through the `chorddemo-api` Edge Function (`?action=list`, `?action=song&id=`), and the analyser writes through the same function with a write key. Adding a song is just adding data: no commit or push.
- Songs that haven't been analysed still play, with lyrics only. The page looks the lyrics up on LRCLIB from the video title.

## Use it

- **Live site:** https://zarleyltd.github.io/ChordDemo/ (GitHub Pages from `main`).
- **Add a song (on the PC):**
  ```
  analyzer\analyze.bat https://www.youtube.com/watch?v=XXXXXXXXXXX
  ```
  This analyses the song and saves it to the library. Reload the app to see it. Add `--title "…" --artist "…"` to override what YouTube reports, or `--file` to write `songs/<id>.json` locally instead (for testing).
- **Fix or remove a song:** `analyzer\.venv\Scripts\python.exe analyzer\chorddemo_api.py rename <id> --title "…" --artist "…"`, `… delete <id>`, or `… list`.
- **Add a list of songs:** `analyzer\.venv\Scripts\python.exe analyzer\batch_add.py analyzer\batch\<list>.tsv`. Full guide, options and troubleshooting: [docs/ADDING_SONGS.md](docs/ADDING_SONGS.md).
- **Write key:** `analyzer/.env` (git-ignored) holds `CHORDDEMO_API` and `CHORDDEMO_WRITE_KEY`. The same key is the `CHORDDEMO_WRITE_KEY` secret on the Edge Function. Copy this file to any other PC that runs the analyser.
- **Local testing:** run `start-demo.bat`, then open http://localhost:3000. Open it in a real browser, not an editor preview, or YouTube refuses to play.

## Installable app

This uses the Edison-style installable app pattern: `manifest.json`, `sw.js` (network-first, so the cache is only the offline fallback), and icons in `assets/icons/`. Whenever you add a JS or CSS file to the page, add it to `SHELL` in `sw.js` and bump `CACHE` (for example `chorddemo-shell-v2`).

## Backend (Supabase)

- Schema migration: `supabase/migrations/`. Apply new ones with the shared-supabase process (never `supabase db push`).
- Edge Function: `supabase/functions/chorddemo-api/`. Deploy with `supabase functions deploy chorddemo-api --no-verify-jwt`.
- The schema isn't exposed to PostgREST; only the Edge Function reads and writes it.

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
