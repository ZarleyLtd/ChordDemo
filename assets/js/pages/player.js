/* Player page: YouTube embed + beat grid + chord strip + synced lyrics. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = {
    id: null, song: null, capo: 0, simple: true, lyricOffset: 0,
    lines: [], shapes: [], beatIdx: -2, lineIdx: -2, rowTop: -1, userScrollUntil: 0,
  };
  let player = null, playerReady = false, pendingId = null, strip = null;
  let clockBase = { t: 0, at: 0 }, lastRaw = -1, shown = 0;

  // ---------------------------------------------------------------- prefs (per song, per device)
  const prefKey = (id) => 'chorddemo:' + id;
  function loadPrefs(id) {
    try { return JSON.parse(localStorage.getItem(prefKey(id))) || {}; } catch { return {}; }
  }
  function savePrefs() {
    if (!st.id) return;
    try {
      localStorage.setItem(prefKey(st.id), JSON.stringify({ capo: st.capo, lyricOffset: st.lyricOffset }));
      localStorage.setItem('chorddemo:simple', st.simple ? '1' : '0');
    } catch { /* storage unavailable: settings just won't persist */ }
  }

  // ---------------------------------------------------------------- YouTube
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => { playerReady = true; if (pendingId) cue(pendingId); },
        onStateChange: onPlayerState,
        onError: (e) => {
          const why = {
            2: 'bad video id', 5: 'HTML5 player error', 100: 'video removed or private',
            101: 'the owner has disabled playback on other sites', 150: 'the owner has disabled playback on other sites',
            152: 'YouTube refused this page (open it in Chrome or Edge, not an editor preview)',
            153: 'no page address was sent (open it in Chrome or Edge, not an editor preview or file)',
          }[e.data] || 'unknown';
          $('meta').textContent = `YouTube error ${e.data}: ${why}`;
        },
      },
    });
  };
  function cue(id) {
    if (!playerReady) { pendingId = id; return; }
    pendingId = null;
    player.cueVideoById(id);
  }
  /** A seek requested before first playback or around an ad can be dropped: re-apply it
   *  (up to 3 times within 20 s of the tap) while the video plays far from the target. */
  function checkPendingSeek(raw, inAd) {
    const p = st.pendingSeek;
    if (!p) return;
    if (inAd) { p.at = performance.now(); return; } // wait for the ad to finish
    if (performance.now() - p.at > 20000 || p.tries >= 3) { st.pendingSeek = null; return; }
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;
    if (performance.now() - (p.last || 0) < 2500) return; // space retries out (an ad may be playing)
    if (raw < p.t - 2 || raw > p.t + 20) { p.tries++; p.last = performance.now(); player.seekTo(p.t, true); }
  }

  /** Play button over the chord strip: shown when a song is loaded but not playing (not during ads). */
  function updateStripPlay() {
    if (!playerReady) return;
    const s = player.getPlayerState();
    const P = YT.PlayerState;
    $('stripPlay').hidden = !(s === P.PAUSED || s === P.CUED || s === P.ENDED);
  }

  function togglePlay() {
    if (!playerReady) return;
    const s = player.getPlayerState();
    if (s === YT.PlayerState.PLAYING || s === YT.PlayerState.BUFFERING) player.pauseVideo();
    else player.playVideo();
  }

  function onPlayerState() {
    updateStripPlay();
    // Unanalysed song: once the video is loaded, try LRCLIB for lyrics. The channel name
    // (often the only place the artist appears) comes from oEmbed; the player leaves it empty.
    if (!st.song && !st.lines.length && !st.lyricsTried && player.getVideoData) {
      const data = player.getVideoData();
      if (data.title) {
        st.lyricsTried = true;
        const id = st.id, duration = player.getDuration() || 0;
        window.Lyrics.videoInfo(id)
          .then((info) => window.Lyrics.searchByTitle(
            (info && info.title) || data.title, duration, (info && info.author) || data.author))
          .then((lrc) => {
            if (st.id !== id) return;
            if (lrc) { st.lines = window.Lyrics.parseLrc(lrc); st.lineIdx = -2; }
            else setLyricText('', 'No synced lyrics found', '');
          })
          .catch(() => { if (st.id === id) setLyricText('', 'Lyrics lookup failed', ''); });
      }
    }
  }

  /** Smoothed playback time: the iframe only reports time a few times a second. */
  function now() {
    if (!playerReady || !player.getCurrentTime) return 0;
    const raw = player.getCurrentTime() || 0;
    // During a YouTube ad the player reports UNSTARTED (-1) while the clock runs on the ad's time.
    const inAd = player.getPlayerState() === YT.PlayerState.UNSTARTED && raw > 0.1;
    if (inAd !== st.inAd) {
      st.inAd = inAd;
      st.beatIdx = -2; st.lineIdx = -2;
      $('adNote').hidden = !inAd;
    }
    checkPendingSeek(raw, inAd);
    if (inAd) { shown = 0; return 0; }
    const t = performance.now();
    if (raw !== lastRaw) { lastRaw = raw; clockBase = { t: raw, at: t }; }
    let est = raw;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
      est = clockBase.t + ((t - clockBase.at) / 1000) * (player.getPlaybackRate() || 1);
    }
    if (est < shown && shown - est < 0.2) est = shown; // avoid flicker backwards
    shown = est;
    return est;
  }

  // ---------------------------------------------------------------- song loading
  async function openSong(id) {
    st.id = id; st.song = null; st.lines = []; st.lyricsTried = false;
    st.beatIdx = -2; st.lineIdx = -2; st.rowTop = -1;
    const p = loadPrefs(id);
    st.capo = p.capo || 0; st.lyricOffset = p.lyricOffset || 0;
    if (location.hash !== '#v=' + id) history.replaceState(null, '', '#v=' + id);
    $('songSelect').value = id;
    cue(id);
    try {
      const res = await fetch('songs/' + id + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('not analysed');
      st.song = await res.json();
    } catch { st.song = null; }
    if (st.id !== id) return; // user switched song meanwhile
    if (st.song) {
      st.key = window.Music.keyOf(st.song.chords);
      // Lyrics are fetched live (not stored in the public repo).
      st.lyricsTried = true;
      const s = st.song;
      window.Lyrics.fetchFor(s.artist, s.title, s.duration)
        .then((lrc) => {
          if (st.id !== id) return;
          if (lrc) { st.lines = window.Lyrics.parseLrc(lrc); st.lineIdx = -2; }
          else setLyricText('', 'No synced lyrics found', '');
        })
        .catch(() => { if (st.id === id) setLyricText('', 'Lyrics lookup failed', ''); });
    }
    $('notAnalysed').hidden = !!st.song;
    $('cmd').textContent = 'analyzer\\analyze.bat ' + id;
    if (!st.lines.length) setLyricText('', 'Looking for lyrics…', '');
    refreshChords();
  }

  function refreshChords() {
    const chords = st.song ? st.song.chords : [];
    const tonic = st.song ? st.key.tonic : null;
    st.shapes = chords.map((c) => window.Music.shapeFor(c, st.capo, st.simple, tonic));
    $('capoVal').textContent = st.capo === 0 ? 'none' : 'fret ' + st.capo;
    if (st.song) {
      // The key estimate is only used for sharp/flat spelling; it isn't reliable enough to show.
      $('meta').textContent = `${st.song.artist} · ${st.song.title} · ${st.song.bpm || '?'} bpm`;
    } else {
      $('meta').textContent = 'Not analysed yet: lyrics only';
    }
    $('simpleBtn').setAttribute('aria-pressed', st.simple);
    const best = window.Music.bestCapo(chords, st.simple);
    $('bestBtn').textContent = 'Best: ' + (best.capo === 0 ? 'no capo' : best.capo);
    $('bestBtn').disabled = !st.song || best.capo === st.capo;
    $('offsetVal').textContent = (st.lyricOffset > 0 ? '+' : '') + st.lyricOffset.toFixed(2) + 's';
    renderGrid();
    strip.build(st.shapes);
    st.beatIdx = -2;
    savePrefs();
  }

  // ---------------------------------------------------------------- beat grid
  function renderGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    if (!st.song) return;
    const n = st.song.beats.length;
    const downs = st.song.downbeats.filter((d) => d > 0 && d < n);
    const starts = [0, ...downs];
    const frag = document.createDocumentFragment();
    starts.forEach((s, k) => {
      const e = k + 1 < starts.length ? starts[k + 1] : n;
      const bar = document.createElement('div');
      bar.className = 'bar';
      for (let i = s; i < e; i++) {
        const cell = document.createElement('button');
        cell.className = 'beat';
        cell.dataset.i = i;
        const shape = st.shapes[i];
        if (i === 0 || shape !== st.shapes[i - 1]) {
          cell.textContent = shape === 'N' ? 'N.C.' : shape;
          cell.classList.add('change');
          if (shape === 'N') cell.classList.add('nc');
        } else if (i === s && shape !== 'N') {
          cell.textContent = shape; // chord carried over from the previous bar
          cell.classList.add('cont');
        }
        bar.appendChild(cell);
      }
      frag.appendChild(bar);
    });
    grid.appendChild(frag);
  }

  function beatAt(t) {
    const b = st.song.beats;
    let lo = 0, hi = b.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }

  // ---------------------------------------------------------------- lyrics
  function setLyricText(prev, cur, next) {
    $('lyPrev').textContent = prev; $('lyNow').textContent = cur; $('lyNext').textContent = next;
  }

  // ---------------------------------------------------------------- frame loop
  function frame() {
    const t = now();
    if (st.song && st.song.beats.length) {
      const i = beatAt(t);
      if (i !== st.beatIdx) {
        const grid = $('grid');
        grid.querySelector('.beat.on')?.classList.remove('on');
        const cell = i >= 0 ? grid.querySelector(`.beat[data-i="${i}"]`) : null;
        if (cell) {
          cell.classList.add('on');
          const top = cell.parentElement.offsetTop;
          if (top !== st.rowTop && performance.now() > st.userScrollUntil) {
            st.rowTop = top;
            grid.scrollTo({ top: Math.max(0, top - grid.clientHeight * 0.25), behavior: 'smooth' });
          }
        }
        strip.setBeat(i);
        st.beatIdx = i;
      }
    }
    if (st.lines.length) {
      const lt = t - st.lyricOffset;
      const li = window.Lyrics.lineAt(st.lines, lt);
      const L = st.lines;
      if (li !== st.lineIdx) {
        st.lineIdx = li; st.wordIdx = -2;
        setLyricText(li > 0 ? L[li - 1].text : '', li >= 0 ? L[li].text || '♪' : '', L[li + 1] ? L[li + 1].text : '');
        if (li >= 0 && L[li].words) {
          $('lyNow').innerHTML = L[li].words.map((w) => `<span>${esc(w.text)}</span>`).join('');
        }
      }
      if (li >= 0 && L[li].words) {
        const words = L[li].words;
        let wi = -1;
        while (wi + 1 < words.length && words[wi + 1].t <= lt) wi++;
        if (wi !== st.wordIdx) {
          st.wordIdx = wi;
          [...$('lyNow').children].forEach((el, k) => el.classList.toggle('sung', k <= wi));
        }
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- controls
  function videoIdFrom(text) {
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(text);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(text.trim()) ? text.trim() : null;
  }

  function wire() {
    $('songSelect').addEventListener('change', (e) => e.target.value && openSong(e.target.value));
    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = videoIdFrom($('addInput').value);
      if (!id) { $('addInput').setCustomValidity('Paste a YouTube link'); $('addInput').reportValidity(); return; }
      $('addInput').value = '';
      openSong(id);
    });
    $('addInput').addEventListener('input', (e) => e.target.setCustomValidity(''));
    $('capoDown').addEventListener('click', () => { st.capo = Math.max(0, st.capo - 1); refreshChords(); });
    $('capoUp').addEventListener('click', () => { st.capo = Math.min(11, st.capo + 1); refreshChords(); });
    $('bestBtn').addEventListener('click', () => {
      st.capo = window.Music.bestCapo(st.song ? st.song.chords : [], st.simple).capo; refreshChords();
    });
    $('chordStrip').addEventListener('click', togglePlay);
    $('chordStrip').addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
    });
    $('simpleBtn').addEventListener('click', () => { st.simple = !st.simple; refreshChords(); });
    $('offDown').addEventListener('click', () => { st.lyricOffset -= 0.25; st.lineIdx = -2; refreshChords(); });
    $('offUp').addEventListener('click', () => { st.lyricOffset += 0.25; st.lineIdx = -2; refreshChords(); });
    $('grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.beat');
      if (!cell || !playerReady) return;
      const target = st.song.beats[+cell.dataset.i];
      st.pendingSeek = { t: target, at: performance.now(), tries: 0 };
      player.seekTo(target, true);
      player.playVideo();
      st.userScrollUntil = 0;
    });
    const pauseAutoScroll = () => { st.userScrollUntil = performance.now() + 4000; };
    $('grid').addEventListener('touchstart', pauseAutoScroll, { passive: true });
    $('grid').addEventListener('wheel', pauseAutoScroll, { passive: true });
    $('copyBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('cmd').textContent); $('copyBtn').textContent = 'Copied'; }
      catch { getSelection().selectAllChildren($('cmd')); }
      setTimeout(() => { $('copyBtn').textContent = 'Copy'; }, 1200);
    });
    window.addEventListener('hashchange', () => {
      const id = (location.hash.match(/v=([A-Za-z0-9_-]{11})/) || [])[1];
      if (id && id !== st.id) openSong(id);
    });
  }

  async function init() {
    try { st.simple = localStorage.getItem('chorddemo:simple') !== '0'; } catch { /* default on */ }
    strip = new window.ChordStrip($('chordStrip'));
    wire();
    let songs = [];
    try { songs = await (await fetch('songs/index.json', { cache: 'no-cache' })).json(); } catch { /* none yet */ }
    const sel = $('songSelect');
    sel.innerHTML = '<option value="">Choose a song…</option>' + songs
      .map((s) => `<option value="${esc(s.id)}">${esc(s.artist)} – ${esc(s.title)}</option>`).join('');
    const fromHash = (location.hash.match(/v=([A-Za-z0-9_-]{11})/) || [])[1];
    const first = fromHash || (songs[0] && songs[0].id);
    if (first) openSong(first);
    requestAnimationFrame(frame);
  }

  window.PlayerPage = { init };
  // Console/debug helper: ChordDemoDebug()
  window.ChordDemoDebug = () => playerReady && ({
    state: player.getPlayerState(), time: player.getCurrentTime(), duration: player.getDuration(),
    video: player.getVideoData() || {}, songDuration: st.song && st.song.duration, pendingSeek: st.pendingSeek,
  });
})();
