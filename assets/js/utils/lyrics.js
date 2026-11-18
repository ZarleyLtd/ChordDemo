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

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const similar = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a.includes(b) || b.includes(a)); };

  /** YouTube channel name -> artist ("Eels - Topic", "EelsVEVO", "Eels Official" -> "Eels"). */
  function cleanAuthor(author) {
    return (author || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '')
      .replace(/\s*(official|music|tv)$/i, '').trim();
  }

  /** Title and channel name of a YouTube video via oEmbed (CORS-enabled). The IFrame player's
   *  getVideoData().author is often empty until playback starts, so it can't be relied on. */
  async function videoInfo(videoId) {
    try {
      const res = await fetch('https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + videoId));
      if (!res.ok) return null;
      const j = await res.json();
      return { title: j.title || '', author: j.author_name || '' };
    } catch { return null; }
  }

  /** Search LRCLIB for a YouTube video; returns LRC text or null.
   *  Only accepts a hit whose title AND artist match. If the artist can't be worked out,
   *  returns null: a title-only match picks up other songs with the same name. */
  async function searchByTitle(title, duration, author) {
    let track = cleanTitle(title), artist = '';
    const dash = track.indexOf(' - ');
    if (dash > 0) { artist = track.slice(0, dash).trim(); track = track.slice(dash + 3).trim(); }
    else artist = cleanAuthor(author);
    if (!artist || !track) return null;
    const res = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(artist + ' ' + track));
    if (!res.ok) return null;
    const hits = (await res.json()).filter((h) => h.syncedLyrics && similar(h.trackName, track) &&
      similar(h.artistName, artist));
    if (!hits.length) return null;
    if (duration > 0) hits.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
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
    return searchByTitle(artist + ' - ' + track, duration);
  }

  window.Lyrics = { parseLrc, lineAt, searchByTitle, fetchFor, videoInfo };
})();
