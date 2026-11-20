"""Analyse a YouTube song for ChordDemo: beats, chords and synced lyrics.

Usage:  analyze.bat <youtube-url-or-id> [more ...]

Writes ../songs/<videoId>.json and updates ../songs/index.json.
The downloaded audio is kept in a temp folder only while analysing, then deleted.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import truststore

truststore.inject_into_ssl()  # trust the Windows certificate store (needed behind Avast HTTPS scanning)

import numpy as np
import requests
import torch

HERE = Path(__file__).resolve().parent
BTC_DIR = HERE / "vendor" / "BTC"
SONGS_DIR = HERE.parent / "songs"
sys.path.insert(0, str(BTC_DIR))

UA = "ChordDemo/0.1 (personal hobby project)"

QUALITY = {  # BTC quality -> display suffix
    "maj": "", "min": "m", "dim": "dim", "aug": "aug", "min6": "m6", "maj6": "6",
    "min7": "m7", "minmaj7": "mMaj7", "maj7": "maj7", "7": "7", "dim7": "dim7",
    "hdim7": "m7b5", "sus2": "sus2", "sus4": "sus4",
}


def video_id(arg: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", arg)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", arg):
        return arg
    raise SystemExit(f"Not a YouTube link or id: {arg}")


def ffmpeg_exe() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


# ---------------------------------------------------------------- download
def download(vid: str, workdir: Path) -> tuple[dict, Path]:
    import yt_dlp
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(workdir / "src.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "js_runtimes": {"node": {}},
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=True)
    src = next(workdir.glob("src.*"))
    wav = workdir / "audio.wav"
    subprocess.run([ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(src),
                    "-ac", "1", "-ar", "44100", str(wav)], check=True)
    return info, wav


def clean_title(t: str) -> str:
    t = re.sub(r"\s*[\(\[][^)\]]*(official|video|audio|lyric|remaster|hd|4k)[^)\]]*[\)\]]", "", t, flags=re.I)
    return re.sub(r"\s+-\s+[^-]*remaster[^-]*$", "", t, flags=re.I).strip()


def artist_and_track(info: dict) -> tuple[str, str]:
    artist = info.get("artist") or (info.get("artists") or [None])[0]
    track = info.get("track")
    if artist and track:
        return artist, clean_title(track)
    title = clean_title(info.get("title", ""))
    if " - " in title:
        a, t = title.split(" - ", 1)
        return a.strip(), t.strip()
    uploader = re.sub(r"(VEVO|\s*-\s*Topic)$", "", info.get("uploader", "")).strip()
    return uploader, title.strip()


# ---------------------------------------------------------------- beats
def detect_beats(wav: Path) -> tuple[np.ndarray, np.ndarray]:
    from beat_this.inference import File2Beats
    f2b = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)
    beats, downbeats = f2b(str(wav))
    return np.asarray(beats, float), np.asarray(downbeats, float)


# ---------------------------------------------------------------- chords (BTC, large vocabulary)
def detect_chords(wav: Path) -> list[tuple[float, float, str]]:
    for alias, typ in (("float", float), ("int", int), ("bool", bool)):  # BTC (2019) uses removed numpy aliases
        if not hasattr(np, alias):
            setattr(np, alias, typ)
    from btc_model import BTC_model
    from utils.hparams import HParams
    from utils.mir_eval_modules import audio_file_to_features, idx2voca_chord

    import yaml
    config = HParams(**yaml.safe_load((BTC_DIR / "run_config.yaml").read_text()))
    config.feature["large_voca"] = True
    config.model["num_chords"] = 170
    idx_to_chord = idx2voca_chord()
    ckpt = torch.load(BTC_DIR / "test" / "btc_model_large_voca.pt", map_location="cpu", weights_only=False)
    model = BTC_model(config=config.model)
    model.load_state_dict(ckpt["model"])
    model.eval()

    feature, time_unit, _ = audio_file_to_features(str(wav), config)
    feature = (feature.T - ckpt["mean"]) / ckpt["std"]
    n_t = config.model["timestep"]
    n_frames = feature.shape[0]
    feature = np.pad(feature, ((0, n_t - n_frames % n_t), (0, 0)))
    x = torch.tensor(feature, dtype=torch.float32).unsqueeze(0)
    preds = []
    with torch.no_grad():
        for t in range(x.shape[1] // n_t):
            out, _ = model.self_attn_layers(x[:, n_t * t:n_t * (t + 1), :])
            p, _ = model.output_layer(out)
            preds.extend(p.squeeze().tolist())
    preds = preds[:n_frames]

    segs, start = [], 0
    for i in range(1, len(preds) + 1):
        if i == len(preds) or preds[i] != preds[start]:
            segs.append((start * time_unit, i * time_unit, idx_to_chord[preds[start]]))
            start = i
    return segs


def display_name(label: str) -> str:
    if label in ("N", "X"):
        return "N"
    root, _, q = label.partition(":")
    return root + QUALITY.get(q or "maj", "")


def chords_per_beat(beats: np.ndarray, segs, end_time: float) -> list[str]:
    """Label each beat with the chord that covers most of it."""
    out = []
    bounds = list(beats) + [min(end_time, beats[-1] + (beats[-1] - beats[-2]) if len(beats) > 1 else end_time)]
    j = 0
    for b0, b1 in zip(bounds[:-1], bounds[1:]):
        while j < len(segs) and segs[j][1] <= b0:
            j += 1
        cover = {}
        k = j
        while k < len(segs) and segs[k][0] < b1:
            s0, s1, lab = segs[k]
            cover[lab] = cover.get(lab, 0) + min(s1, b1) - max(s0, b0)
            k += 1
        out.append(display_name(max(cover, key=cover.get)) if cover else "N")
    return out


PITCH = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
TONES = {  # display suffix -> chord-tone intervals above the root
    "": (0, 4, 7), "m": (0, 3, 7), "dim": (0, 3, 6), "aug": (0, 4, 8), "m6": (0, 3, 7, 9), "6": (0, 4, 7, 9),
    "m7": (0, 3, 7, 10), "mMaj7": (0, 3, 7, 11), "maj7": (0, 4, 7, 11), "7": (0, 4, 7, 10),
    "dim7": (0, 3, 6, 9), "m7b5": (0, 3, 6, 10), "sus2": (0, 2, 7), "sus4": (0, 5, 7),
}
SLASH_MIN_SHARE = 0.15   # bass note's share of the bass-register energy on that beat
SLASH_OVER_ROOT = 1.4    # bass note must be this much stronger than the chord's root
SLASH_NEAR_TOP = 0.7     # ... and at least this fraction of the loudest bass note (which may be
                         # the previous chord's bass still ringing, e.g. F under the C/E of a walk-down)


def detect_bass(wav: Path, beats: np.ndarray, chords: list[str]) -> list[int]:
    """Per beat: the bass pitch class (0-11) when the chord is clearly an inversion
    (bass = another chord tone, e.g. C/E), else -1. The chord model itself has no bass notes."""
    import librosa
    y, sr = librosa.load(str(wav), sr=22050, mono=True)
    tuning = librosa.estimate_tuning(y=y, sr=sr)
    hop = 256
    cqt = np.abs(librosa.cqt(y, sr=sr, hop_length=hop, fmin=librosa.note_to_hz("E1"), n_bins=72,
                             bins_per_octave=36, tuning=tuning))  # E1..E3, 3 bins per semitone
    pcs = np.zeros((12, cqt.shape[1]))
    for k in range(cqt.shape[0]):
        pcs[(4 + (k + 1) // 3) % 12] += cqt[k]
    times = librosa.frames_to_time(np.arange(cqt.shape[1]), sr=sr, hop_length=hop)
    out = []
    for i, b in enumerate(beats):
        nxt = beats[i + 1] if i + 1 < len(beats) else b + 0.5
        sel = (times >= b) & (times < b + 0.6 * (nxt - b))  # the on-beat part of the beat
        name = chords[i]
        m = re.match(r"^([A-G]#?)(.*)$", name)
        if not sel.any() or not m or m.group(2) not in TONES:
            out.append(-1)
            continue
        e = pcs[:, sel].mean(axis=1)
        root = PITCH[m.group(1)]
        others = [(root + iv) % 12 for iv in TONES[m.group(2)] if iv != 0]
        bass = max(others, key=lambda k: e[k])  # loudest non-root chord tone
        share = e[bass] / (e.sum() + 1e-9)
        if (share >= SLASH_MIN_SHARE and e[bass] >= SLASH_OVER_ROOT * e[root]
                and e[bass] >= SLASH_NEAR_TOP * e.max()):
            out.append(bass)
        else:
            out.append(-1)
    return out


def regular_bars(down: list[int], n_beats: int) -> list[int]:
    """The downbeat model sometimes flips to 2-beat bars for a section. Find the song's main
    meter, then step through the beats in bars of that length, snapping to a detected
    downbeat when one is within one beat (so real phase shifts are kept)."""
    if len(down) < 4:
        return down
    lens = np.diff(down + [n_beats])
    weight = {}
    for L in lens:
        if 2 <= L <= 7:
            weight[int(L)] = weight.get(int(L), 0) + int(L)
    meter = max(weight, key=weight.get) if weight else 4
    if meter == 2 and weight.get(4, 0) * 2 >= weight[2]:
        meter = 4
    detected = set(down)
    out, i = [], down[0]
    while i < n_beats:
        snap = next((j for j in (i, i - 1, i + 1) if j in detected and (not out or j > out[-1])), i)
        out.append(snap)
        i = snap + meter
    return out


# ---------------------------------------------------------------- lyrics (LRCLIB)
def fetch_lyrics(artist: str, track: str, duration: float) -> dict | None:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    try:
        r = s.get("https://lrclib.net/api/get", timeout=15, params={
            "artist_name": artist, "track_name": track, "duration": round(duration)})
        if r.ok and r.json().get("syncedLyrics"):
            return r.json()
        r = s.get("https://lrclib.net/api/search", timeout=15,
                  params={"track_name": track, "artist_name": artist})
        hits = [h for h in (r.json() if r.ok else []) if h.get("syncedLyrics")]
        if not hits:
            r = s.get("https://lrclib.net/api/search", timeout=15, params={"q": f"{artist} {track}"})
            hits = [h for h in (r.json() if r.ok else []) if h.get("syncedLyrics")]
        if hits:
            return min(hits, key=lambda h: abs((h.get("duration") or 0) - duration))
    except requests.RequestException as e:
        print(f"  lyrics lookup failed: {e}")
    return None


# ---------------------------------------------------------------- main
def analyse(arg: str) -> None:
    vid = video_id(arg)
    t0 = time.time()
    work = Path(tempfile.mkdtemp(prefix="chorddemo-"))
    try:
        print(f"[{vid}] downloading audio ...")
        info, wav = download(vid, work)
        artist, track = artist_and_track(info)
        duration = float(info.get("duration") or 0)
        print(f"[{vid}] {artist} - {track} ({duration:.0f}s); embeddable={info.get('playable_in_embed')}")
        print(f"[{vid}] detecting beats ...")
        beats, downbeats = detect_beats(wav)
        print(f"[{vid}] {len(beats)} beats, {len(downbeats)} bars; detecting chords ...")
        segs = detect_chords(wav)
        chords = chords_per_beat(beats, segs, duration or segs[-1][1])
        print(f"[{vid}] detecting bass notes ...")
        bass = detect_bass(wav, beats, chords)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    down_idx = regular_bars(sorted({int(np.argmin(np.abs(beats - d))) for d in downbeats}), len(beats))
    bpm = round(60 / float(np.median(np.diff(beats))), 1) if len(beats) > 1 else None
    lyr = fetch_lyrics(artist, track, duration)
    print(f"[{vid}] lyrics: {'found' if lyr else 'not found'}")

    song = {
        "id": vid, "title": track, "artist": artist, "duration": duration, "bpm": bpm,
        "beats": [round(float(b), 3) for b in beats],
        "downbeats": down_idx,
        "chords": chords,
        # bass pitch class (0=C .. 11=B) per beat when the chord is an inversion (e.g. C/E), else -1
        "bass": bass,
        # Lyrics are not stored (the repo is public); the page fetches them live from LRCLIB.
        "lyricsFound": bool(lyr),
        "analysedAt": time.strftime("%Y-%m-%d %H:%M"),
        "models": {"beats": "Beat This! final0", "chords": "BTC large-vocabulary", "bass": "bass-register CQT"},
    }
    SONGS_DIR.mkdir(exist_ok=True)
    (SONGS_DIR / f"{vid}.json").write_text(json.dumps(song, separators=(",", ":")), encoding="utf-8")

    idx_path = SONGS_DIR / "index.json"
    index = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else []
    index = [s for s in index if s["id"] != vid] + [{"id": vid, "title": track, "artist": artist}]
    index.sort(key=lambda s: (s["artist"].lower(), s["title"].lower()))
    idx_path.write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"[{vid}] done in {time.time() - t0:.0f}s, {bpm} bpm -> songs/{vid}.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("songs", nargs="+", help="YouTube URL or 11-character video id")
    for a in ap.parse_args().songs:
        analyse(a)
