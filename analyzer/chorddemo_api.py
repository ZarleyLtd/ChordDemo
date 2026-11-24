"""Save, rename, delete and import ChordDemo songs in Supabase (the chorddemo-api Edge Function).

The write key lives in analyzer/.env (git-ignored):
    CHORDDEMO_API=https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/chorddemo-api
    CHORDDEMO_WRITE_KEY=...

Command line (run with the analyser's Python):
    python chorddemo_api.py list
    python chorddemo_api.py rename <videoId> --title "New title" --artist "New artist"
    python chorddemo_api.py delete <videoId>
    python chorddemo_api.py import <song.json> [...]
"""
import argparse
import json
import sys
from pathlib import Path

import requests
import truststore

truststore.inject_into_ssl()  # trust the Windows certificate store (needed behind Avast HTTPS scanning)

ENV = Path(__file__).resolve().parent / ".env"


def _config() -> tuple[str, str]:
    vals = {}
    if ENV.exists():
        for line in ENV.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip()
    url, key = vals.get("CHORDDEMO_API"), vals.get("CHORDDEMO_WRITE_KEY")
    if not url or not key:
        raise SystemExit(f"Missing CHORDDEMO_API / CHORDDEMO_WRITE_KEY in {ENV}")
    return url, key


def _post(body: dict) -> dict:
    url, key = _config()
    r = requests.post(url, json={**body, "key": key}, timeout=60)
    out = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text}
    if not r.ok:
        raise SystemExit(f"chorddemo-api {body.get('action')}: {r.status_code} {out.get('error')}")
    return out


def save_song(song: dict) -> None:
    _post({"action": "save", "song": song})


def rename_song(vid: str, title: str | None, artist: str | None) -> None:
    _post({"action": "update", "id": vid, "title": title, "artist": artist})


def delete_song(vid: str) -> None:
    _post({"action": "delete", "id": vid})


def list_songs() -> list[dict]:
    url, _ = _config()
    r = requests.get(url, params={"action": "list"}, timeout=30)
    r.raise_for_status()
    return r.json()["songs"]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    p = sub.add_parser("rename"); p.add_argument("id"); p.add_argument("--title"); p.add_argument("--artist")
    p = sub.add_parser("delete"); p.add_argument("id")
    p = sub.add_parser("import"); p.add_argument("files", nargs="+")
    a = ap.parse_args()
    if a.cmd == "list":
        for s in list_songs():
            print(f"{s['id']}  {s['artist']} - {s['title']}")
    elif a.cmd == "rename":
        rename_song(a.id, a.title, a.artist); print("renamed", a.id)
    elif a.cmd == "delete":
        delete_song(a.id); print("deleted", a.id)
    elif a.cmd == "import":
        for f in a.files:
            s = json.loads(Path(f).read_text(encoding="utf-8"))
            save_song(s); print("imported", s["id"], "-", s["artist"], "-", s["title"])
    sys.exit(0)
