"""Save, rename, delete and import Stomper songs in Supabase (the stomper-api Edge Function).

The write key lives in analyzer/.env (git-ignored):
    STOMPER_API=https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/stomper-api
    STOMPER_WRITE_KEY=...

Command line (run with the analyser's Python):
    python stomper_api.py list
    python stomper_api.py rename <videoId> --title "New title" --artist "New artist"
    python stomper_api.py delete <videoId>
    python stomper_api.py import <song.json> [...]
    python stomper_api.py invite [--admin] [--label "Who it's for"]   (one-time code to register in the app)
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
    url, key = vals.get("STOMPER_API"), vals.get("STOMPER_WRITE_KEY")
    if not url or not key:
        raise SystemExit(f"Missing STOMPER_API / STOMPER_WRITE_KEY in {ENV}")
    return url, key


def _post(body: dict) -> dict:
    url, key = _config()
    r = requests.post(url, json={**body, "key": key}, timeout=60)
    out = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text}
    if not r.ok:
        raise SystemExit(f"stomper-api {body.get('action')}: {r.status_code} {out.get('error')}")
    return out


def save_song(song: dict) -> None:
    _post({"action": "save", "song": song})


def rename_song(vid: str, title: str | None, artist: str | None) -> None:
    _post({"action": "update", "id": vid, "title": title, "artist": artist})


def delete_song(vid: str) -> None:
    _post({"action": "delete", "id": vid})


def create_invite(admin: bool, label: str | None) -> dict:
    return _post({"action": "invite", "isAdmin": admin, "label": label})


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
    p = sub.add_parser("invite"); p.add_argument("--admin", action="store_true"); p.add_argument("--label")
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
    elif a.cmd == "invite":
        inv = create_invite(a.admin, a.label)
        kind = "Admin" if inv["isAdmin"] else "User"
        print(f"{kind} invite code: {inv['code']}  (one use, expires {inv['expiresAt']})")
    sys.exit(0)
