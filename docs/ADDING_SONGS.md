# Adding and managing songs

Songs live in Supabase (the `chorddemo.songs` table on the shared Apps project). Adding a song only adds data: there's no commit or push. Reload the app afterwards and the song appears in the Song Library.

Run every command below from the `ChordDemo` folder on the PC where the analyser is set up. See "First-time analyser setup" in the [README](../README.md).

## Add one song

```
analyzer\analyze.bat https://www.youtube.com/watch?v=XXXXXXXXXXX
```

This downloads the audio to a temp folder, then detects the beats, bars, chords and bass notes. It checks LRCLIB for synced lyrics, deletes the audio and saves the song to the library. It takes about 25 seconds on this PC.

Options:

| Option | What it does |
|---|---|
| `--title "Wicked Game" --artist "Chris Isaak"` | Uses these names instead of YouTube's. Use it when the video title is messy, because the lyrics lookup depends on the right names. Works with one song only. |
| `--file` | Writes `songs\<id>.json` locally instead of saving it to the library. This is for testing. |

You can pass several links at once (`analyze.bat <link1> <link2> …`). They're analysed one after another, using YouTube's names.

**Choosing a video:** pick one that allows embedding, or it won't play in the app. Official audio or "Topic" uploads usually work best. Avoid live, cover and lyric-edit versions, because their timing differs from the analysed audio.

The `<id>` used in the commands below is the 11-character code at the end of the YouTube link (`watch?v=<id>`).

## Fix, remove or list songs

```
analyzer\.venv\Scripts\python.exe analyzer\chorddemo_api.py list
analyzer\.venv\Scripts\python.exe analyzer\chorddemo_api.py rename <id> --title "…" --artist "…"
analyzer\.venv\Scripts\python.exe analyzer\chorddemo_api.py delete <id>
analyzer\.venv\Scripts\python.exe analyzer\chorddemo_api.py import <song.json> [...]
```

- **rename** changes the name shown in the library and used for the lyrics lookup. Give either or both options.
- **To replace a bad recording:** `delete` it, then run `analyze.bat` with a better link and the `--title`/`--artist` you want.
- **import** saves song files made with `--file`.

## Add a list of songs (batch)

```
analyzer\.venv\Scripts\python.exe analyzer\batch_add.py analyzer\batch\<list>.tsv
```

The list is a tab-separated file with a header row `Artist<TAB>Title`. Keep lists in `analyzer\batch\`, which git ignores. For each song, the script:

1. Skips the song if the library already has the same artist and title.
2. Searches YouTube for "artist title official audio". It takes the first result that:
   - can be embedded
   - is 1–15 minutes long
   - isn't labelled live, cover, karaoke, lesson or remix
   - includes the song title in the video title
   - names the artist in the title, channel or description
3. Analyses that video using the list's clean title and artist, and saves it to the library.
4. Records the outcome in `<list>.log.tsv`: `added` with the video used, `already in library`, `no suitable video`, or `failed: …` with the reason.

Each song takes about a minute, which includes a 15-second pause between YouTube downloads. Add `--limit N` to stop after N new songs.

The run can be resumed: songs already in the log are skipped. **To retry failures**, delete their lines from the log and run the same command again. For songs logged as `no suitable video`, find a link yourself and add the song with `analyze.bat <link> --title "…" --artist "…"`.

`analyzer\batch\ug-songs.tsv` is the cleaned list of songs from the UG account (373 songs).

## Write key

`analyzer\.env` (git-ignored) holds:

```
CHORDDEMO_API=https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/chorddemo-api
CHORDDEMO_WRITE_KEY=…
```

The key must match the `CHORDDEMO_WRITE_KEY` secret on the `chorddemo-api` Edge Function, which rejects writes without it. To run the analyser on another PC, copy this file there. Never commit it, because the repo is public.

To change the key, generate a new one, put it in `analyzer\.env`, then run `supabase secrets set --env-file analyzer\.env` from the `ChordDemo` folder.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `HTTP Error 403: Forbidden` while downloading | YouTube is refusing downloads for a while. Wait and retry. Updating yt-dlp often helps: `analyzer\.venv\Scripts\pip install -U "yt-dlp[default]"`. |
| `Failed to resolve …googlevideo.com` | A network blip. Retry. |
| `chorddemo-api save: 403 Not allowed` | `analyzer\.env` is missing, or its key doesn't match the function secret. |
| The song is saved but won't play in the app | The video doesn't allow embedding. Delete the song and use another upload. |
| Lyrics show "No synced lyrics found" | LRCLIB has no synced lyrics under that artist and title. Try `rename` with the official names. |
| Chords drift out of time | The video is a different recording (live, remaster, or a different edit). Replace it. |
