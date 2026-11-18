/* Synced lyrics: LRC parsing and LRCLIB lookup (lrclib.net, free, no key, CORS-enabled). */
(function () {
  function parseLrc(text) {
    const lines = [];
    for (const raw of (text || '').split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) continue;
      const body = raw.replace(/\[[^\]]*\]/g, '');
      const text = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      // Enhanced LRC: <mm:ss.xx>word timings, used for word-by-word highlighting.
      const words = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g)]
        .map((w) => ({ t: +w[1] * 60 + +w[2], text: w[3] }))
        .filter((w) => w.text.trim());
      for (const s of stamps) lines.push({ t: +s[1] * 60 + +s[2], text, words: words.length ? words : null });
    }
    return lines.sort((a, b) => a.t - b.t);
  }

  /** Index of the last line whose time <= t, or -1. */
  function lineAt(lines, t) {
    let lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function cleanTitle(title) {
    return title
      .replace(/[([][^)\]]*(official|video|audio|lyric|remaster|hd|4k|live)[^)\]]*[)\]]/gi, '')
      .replace(/\s+/g, ' ').trim();
  }

  /** Search LRCLIB by a YouTube video title; returns LRC text or null. */
  async function searchByTitle(title, duration) {
    const q = cleanTitle(title);
    const res = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    if (!res.ok) return null;
    const hits = (await res.json()).filter((h) => h.syncedLyrics);
    if (!hits.length) return null;
    hits.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
    return hits[0].syncedLyrics;
  }

  /** Exact lookup by artist/track/duration, falling back to a search; returns LRC text or null. */
  async function fetchFor(artist, track, duration) {
    const p = new URLSearchParams({ artist_name: artist, track_name: track, duration: Math.round(duration) });
    try {
      const res = await fetch('https://lrclib.net/api/get?' + p);
      if (res.ok) {
        const j = await res.json();
        if (j.syncedLyrics) return j.syncedLyrics;
      }
    } catch { /* fall through to search */ }
    return searchByTitle(artist + ' ' + track, duration);
  }

  window.Lyrics = { parseLrc, lineAt, searchByTitle, fetchFor };
})();
