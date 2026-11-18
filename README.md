# ChordDemo

A bare-bones Chordify-style demo: a YouTube player, chords on a beat grid, synced lyrics, and a capo setting.

## How it works

- **Phone/web page** (`index.html`): static HTML, CSS and JS with no build step. It plays the song in the YouTube IFrame player and polls the playback time to highlight the current beat, chord and lyric line.
- **Analyser** (`analyzer/analyze.py`, runs on the PC): downloads the audio once with yt-dlp into a temp folder, then runs:
  - **Beat This!** (JKU, ISMIR 2024) for beats and downbeats
  - **BTC** (ISMIR 2019, large vocabulary) for chords, snapped to beats

  It then fetches synced lyrics from **LRCLIB** and writes `songs/<videoId>.json`. The audio is deleted afterwards.
- Songs that haven't been analysed still play, with lyrics only. The page looks the lyrics up on LRCLIB from the video title.

## Run it

```
analyzer\analyze.bat https://www.youtube.com/watch?v=XXXXXXXXXXX
npx serve .
```

Open http://localhost:3000 on the PC. On a phone on the same Wi-Fi, open the "Network" address that `serve` prints.

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
