"""Add a list of songs to the ChordDemo library, one at a time.

Usage:  .venv\\Scripts\\python.exe batch_add.py batch\\ug-songs.tsv [--limit N]

The list is a tab-separated file with a header row: Artist<TAB>Title.
For each song it searches YouTube, picks the first result that is embeddable, a sensible length,
and not a live/cover/karaoke/lesson upload, then analyses it with the given title and artist
(so lyrics lookups and the Song Library use the clean names) and saves it to Supabase.

Resumable: results go to <list>.log.tsv; songs already done, or already in the library, are skipped.
Re-run it to retry failures after deleting their lines from the log.
"""
import argparse
import csv
import re
import sys
import time
from pathlib import Path

import yt_dlp

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import analyze  # noqa: E402
from chorddemo_api import list_songs  # noqa: E402

BAD = re.compile(r"\b(live|cover|karaoke|lesson|tutorial|instrumental|reaction|remix|8d|slowed|sped up|nightcore|"
                 r"how to play|guitar|piano|bass|drum|backing track)\b", re.I)
PAUSE_S = 15  # be gentle with YouTube between downloads


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"^the\s+", "", s.lower()))


def pick_video(artist: str, title: str, used: set[str]) -> tuple[str, str] | None:
    """Return (video id, YouTube title) for the best embeddable match, or None."""
    want_bad = BAD.findall(title)  # e.g. a song actually called "... Live" keeps that word allowed
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True,
            "js_runtimes": {"node": {}}}
    with yt_dlp.YoutubeDL({**opts, "extract_flat": True}) as ydl:
        res = ydl.extract_info(f"ytsearch8:{artist} {title} official audio", download=False)
    with yt_dlp.YoutubeDL(opts) as ydl:
        for e in res.get("entries") or []:
            vid, yt_title = e.get("id"), e.get("title") or ""
            if not vid or vid in used:
                continue
            if [w for w in BAD.findall(yt_title) if w.lower() not in {x.lower() for x in want_bad}]:
                continue
            core = norm(re.sub(r"\(.*?\)", "", title))[:12] or norm(title)[:12]
            if core not in norm(yt_title):
                continue  # the song title must appear in the video title
            try:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
            except Exception:
                continue
            hay = norm(" ".join(str(info.get(k) or "") for k in ("title", "channel", "uploader", "artist", "creator"))
                       + " " + (info.get("description") or "")[:600])
            if norm(artist)[:8] not in hay:
                continue  # the artist must be named somewhere (filters unlabelled covers)
            dur = info.get("duration") or 0
            if not info.get("playable_in_embed") or not 60 <= dur <= 900 or info.get("is_live"):
                continue
            return vid, yt_title
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("list")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many new songs")
    a = ap.parse_args()
    src = Path(a.list)
    log_path = src.with_suffix(".log.tsv")
    done = set()
    if log_path.exists():
        for row in csv.reader(log_path.open(encoding="utf-8"), delimiter="\t"):
            if len(row) >= 2:
                done.add((row[0], row[1]))
    else:
        log_path.write_text("Artist\tTitle\tStatus\tVideo\tYouTube title\tWhen\n", encoding="utf-8")

    rows = list(csv.DictReader(src.open(encoding="utf-8"), delimiter="\t"))
    lib = list_songs()
    have = {(norm(s["artist"]), norm(s["title"])) for s in lib}
    used = {s["id"] for s in lib}
    added = 0

    def log(artist, title, status, vid="", yt=""):
        with log_path.open("a", encoding="utf-8", newline="") as f:
            csv.writer(f, delimiter="\t").writerow([artist, title, status, vid, yt, time.strftime("%Y-%m-%d %H:%M")])
        print(f"== {status}: {artist} - {title} {vid}", flush=True)

    for i, r in enumerate(rows, 1):
        artist, title = r["Artist"], r["Title"]
        if (artist, title) in done:
            continue
        print(f"\n[{i}/{len(rows)}] {artist} - {title}", flush=True)
        if (norm(artist), norm(title)) in have:
            log(artist, title, "already in library"); continue
        try:
            found = pick_video(artist, title, used)
            if not found:
                log(artist, title, "no suitable video"); continue
            vid, yt = found
            analyze.analyse(vid, title=title, artist_name=artist)
            used.add(vid); have.add((norm(artist), norm(title))); added += 1
            log(artist, title, "added", vid, yt)
        except KeyboardInterrupt:
            raise
        except BaseException as e:  # SystemExit from save errors, download errors, model errors
            log(artist, title, f"failed: {str(e)[:150]}")
        if a.limit and added >= a.limit:
            break
        time.sleep(PAUSE_S)
    print(f"\nFinished: {added} added this run. Log: {log_path}", flush=True)


if __name__ == "__main__":
    main()
