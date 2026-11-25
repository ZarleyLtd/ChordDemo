/* Player page: YouTube embed + beat grid + chord strip + synced lyrics. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = {
    id: null, song: null, capo: 0, simple: true, lyricOffset: 0,
    lines: [], shapes: [], beatIdx: -2, lineIdx: -2, rowTop: -1, userScrollUntil: 0,
    loop: null,        // { a, b, start, end }: beat indices and times; playback repeats start..end
    loopSetup: null,   // null when off; { first: null | beat index } while picking the two beats
    loopSeekAt: 0,
  };
  let player = null, playerReady = false, pendingId = null, strip = null;
  let clockBase = { t: 0, at: 0 }, lastRaw = -1, shown = 0;
  let library = [];
  let favourites = new Set(); // video ids the connected user has marked as favourite
  // Song library lives in Supabase (schema stomper), served by the stomper-api Edge Function.
  const api = (params) => window.StomperApi.get(params);
  const lib = { sort: 'title', favsOnly: false };

  // ---------------------------------------------------------------- prefs (per song, per device)
  const prefKey = (id) => 'stomper:' + id;
  function loadPrefs(id) {
    try { return JSON.parse(localStorage.getItem(prefKey(id))) || {}; } catch { return {}; }
  }
  function savePrefs() {
    if (!st.id) return;
    try {
      localStorage.setItem(prefKey(st.id), JSON.stringify({ capo: st.capo, lyricOffset: st.lyricOffset }));
      localStorage.setItem('stomper:simple', st.simple ? '1' : '0');
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
    st.loop = null; st.loopSetup = null; updateLoopUi();
    const p = loadPrefs(id);
    st.capo = p.capo || 0; st.lyricOffset = p.lyricOffset || 0;
    if (location.hash !== '#v=' + id) history.replaceState(null, '', '#v=' + id);
    showNowTitle();
    updateFavBtn();
    cue(id);
    try {
      st.song = (await api({ action: 'song', id })).song;
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
    showNowTitle();
    $('notAnalysed').hidden = !!st.song;
    $('cmd').textContent = 'analyzer\\analyze.bat ' + id;
    if (!st.lines.length) setLyricText('', 'Looking for lyrics…', '');
    refreshChords();
  }

  function refreshChords() {
    const chords = st.song ? st.song.chords : [];
    const tonic = st.song ? st.key.tonic : null;
    st.shapes = st.song
      ? window.Music.beatShapes(chords, st.song.bass, st.song.downbeats, st.capo, st.simple, tonic)
      : [];
    $('capoVal').textContent = st.capo === 0 ? 'none' : 'fret ' + st.capo;
    if (st.song) {
      // The key estimate is only used for sharp/flat spelling; it isn't reliable enough to show.
      $('meta').textContent = `${st.song.artist} · ${st.song.title} · ${st.song.bpm || '?'} bpm`;
    } else {
      $('meta').textContent = 'Not analysed yet: lyrics only';
    }
    $('simpleBtn').setAttribute('aria-pressed', st.simple);
    const best = window.Music.bestCapo(chords, st.simple);
    // Suggested capo: just the fret number in a green button (0 = no capo).
    const bestLabel = 'Suggested capo: ' + (best.capo === 0 ? 'none' : 'fret ' + best.capo);
    $('bestBtn').textContent = String(best.capo);
    $('bestBtn').setAttribute('aria-label', bestLabel + (best.capo === st.capo ? '' : ' (tap to use)'));
    $('bestBtn').title = bestLabel;
    $('bestBtn').disabled = !st.song || best.capo === st.capo;
    renderGrid();
    markLoop();
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
          if (shape.length > 4) cell.classList.add('long');
          if (shape === 'N') cell.classList.add('nc');
        } else if (i === s && shape !== 'N') {
          cell.textContent = shape; // chord carried over from the previous bar
          cell.classList.add('cont');
          if (shape.length > 4) cell.classList.add('long');
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
    keepLooping(t);
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

  // ---------------------------------------------------------------- loop between two beats
  function updateLoopUi() {
    $('loopBtn').setAttribute('aria-pressed', String(!!(st.loop || st.loopSetup)));
    $('grid').classList.toggle('loop-setup', !!st.loopSetup);
    markLoop();
  }

  function markLoop() {
    const grid = $('grid');
    grid.querySelectorAll('.loop-start, .in-loop').forEach((c) => c.classList.remove('loop-start', 'in-loop'));
    if (st.loopSetup && st.loopSetup.first != null) {
      grid.querySelector(`.beat[data-i="${st.loopSetup.first}"]`)?.classList.add('loop-start');
    }
    if (st.loop) {
      for (let i = st.loop.a; i <= st.loop.b; i++) grid.querySelector(`.beat[data-i="${i}"]`)?.classList.add('in-loop');
    }
  }

  function seekTo(t) {
    st.pendingSeek = { t, at: performance.now(), tries: 0 };
    player.seekTo(t, true);
    player.playVideo();
    st.userScrollUntil = 0;
  }

  function onLoopButton(btn) {
    if (st.loop || st.loopSetup) {
      st.loop = null; st.loopSetup = null; updateLoopUi();
      window.BriefMessage.show('Loop off', btn);
      return;
    }
    if (!st.song) { window.BriefMessage.show('Loop needs an analysed song', btn); return; }
    st.loopSetup = { first: null }; updateLoopUi();
    window.BriefMessage.show('Tap the first beat', btn, { durationMs: 1500 });
  }

  /** Grid tap while picking the loop: first tap marks one end, second sets the loop and starts it. */
  function pickLoopBeat(i, cell) {
    if (st.loopSetup.first == null) {
      st.loopSetup.first = i; markLoop();
      window.BriefMessage.show('Now tap the last beat', cell, { durationMs: 1500 });
      return;
    }
    const a = Math.min(st.loopSetup.first, i), b = Math.max(st.loopSetup.first, i);
    const beats = st.song.beats;
    // Play through the whole of the last beat: stop where the next beat would start.
    const end = b + 1 < beats.length ? beats[b + 1]
      : (st.song.duration || beats[b] + (beats[b] - (beats[b - 1] ?? beats[b] - 0.5)));
    st.loop = { a, b, start: beats[a], end };
    st.loopSetup = null; updateLoopUi();
    window.BriefMessage.show(`Looping ${b - a + 1} beats`, cell);
    seekTo(st.loop.start);
  }

  /** Called every frame: jump back to the loop start as soon as playback reaches the loop end. */
  function keepLooping(t) {
    const L = st.loop;
    if (!L || !playerReady || st.inAd || player.getPlayerState() !== YT.PlayerState.PLAYING) return;
    if (performance.now() - st.loopSeekAt < 400) return; // let the last jump land first
    if (t >= L.end - 0.04) { // a few ms early, to cover the seek delay
      st.loopSeekAt = performance.now();
      st.pendingSeek = null;
      shown = 0; lastRaw = -1; // don't let the flicker guard hold the clock at the loop end
      player.seekTo(L.start, true);
    }
  }

  // ---------------------------------------------------------------- song library + add dialogs
  function showNowTitle() {
    const s = st.song || library.find((x) => x.id === st.id);
    $('nowTitle').textContent = s ? s.title + ' – ' + s.artist : (st.id ? 'Not analysed yet' : '');
  }

  function renderLibrary() {
    const by = lib.sort, other = by === 'title' ? 'artist' : 'title';
    $('sortBtn').textContent = 'Sort: ' + (by === 'title' ? 'Title' : 'Artist');
    const q = $('filterInput').hidden ? '' : $('filterInput').value.trim().toLowerCase();
    const favsOnly = lib.favsOnly && window.Account.isSignedIn();
    $('favFilterBtn').setAttribute('aria-pressed', String(favsOnly));
    const rows = library
      .filter((s) => !favsOnly || favourites.has(s.id))
      .filter((s) => !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      .sort((a, b) => a[by].localeCompare(b[by], undefined, { sensitivity: 'base' })
        || a[other].localeCompare(b[other], undefined, { sensitivity: 'base' }));
    const cur = (s) => (s.id === st.id ? ' current' : '');
    let html, lastArtist = null;
    if (by === 'artist') {
      // Artist header, then that artist's songs (titles only), indented beneath it.
      html = rows.map((s) => {
        const key = s.artist.toLowerCase();
        const head = key === lastArtist ? '' : `<li class="artist-head">${esc(s.artist)}</li>`;
        lastArtist = key;
        return head + `<li><button type="button" class="in-group${cur(s)}" data-id="${esc(s.id)}">`
          + `<span class="main">${esc(s.title)}</span></button></li>`;
      }).join('');
    } else {
      html = rows.map((s) => `<li><button type="button" class="${cur(s).trim()}" data-id="${esc(s.id)}">`
        + `<span class="main">${esc(s.title)}</span><span class="sub">${esc(s.artist)}</span></button></li>`).join('');
    }
    $('songList').innerHTML = rows.length
      ? html : `<li class="empty">${!library.length ? 'No songs yet'
        : favsOnly && !q ? 'No favourites yet' : 'No songs match'}</li>`;
  }

  /** A modal dialog is centred vertically, so a shorter or longer list moves its top. Fix the top
   *  where it is now, so the header (and the button just tapped) stays put as the list changes. */
  function pinTop(dlg) {
    const top = dlg.getBoundingClientRect().top;
    dlg.style.margin = `${top}px auto auto`;
    dlg.style.maxHeight = `min(80dvh, 640px, calc(100dvh - ${top + 12}px))`; // don't run off the bottom
  }

  function openLibrary() {
    // Always start on the full list: clear and hide any filter left from last time.
    $('filterInput').value = '';
    $('filterInput').hidden = true;
    $('filterBtn').setAttribute('aria-pressed', 'false');
    lib.favsOnly = false;
    // Back to the browser's default vertical centring (pinTop may have fixed the top last time).
    $('libraryDlg').style.margin = ''; $('libraryDlg').style.maxHeight = '';
    renderLibrary();
    $('libraryDlg').showModal();
    const cur = $('songList').querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function wireDialogs() {
    try { if (localStorage.getItem('stomper:sort') === 'artist') lib.sort = 'artist'; } catch { /* default title */ }
    $('libraryBtn').addEventListener('click', openLibrary);
    $('sortBtn').addEventListener('click', () => {
      lib.sort = lib.sort === 'title' ? 'artist' : 'title';
      try { localStorage.setItem('stomper:sort', lib.sort); } catch { /* not persisted */ }
      renderLibrary();
    });
    $('filterBtn').addEventListener('click', () => {
      const on = $('filterInput').hidden;
      $('filterInput').hidden = !on;
      $('filterBtn').setAttribute('aria-pressed', String(on));
      if (on) $('filterInput').focus(); else $('filterInput').value = '';
      renderLibrary();
    });
    $('filterInput').addEventListener('input', renderLibrary);
    $('favFilterBtn').addEventListener('click', (e) => {
      if (!window.Account.isSignedIn()) {
        window.BriefMessage.show('Log in to use the Favourite function', e.currentTarget);
        // The shared helper appends to <body>, under the modal's top layer: move it into the dialog.
        const msgs = document.body.querySelectorAll(':scope > .brief-message');
        if (msgs.length) $('libraryDlg').appendChild(msgs[msgs.length - 1]);
        return;
      }
      lib.favsOnly = !lib.favsOnly;
      pinTop($('libraryDlg'));
      renderLibrary();
    });
    $('songList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      $('libraryDlg').close();
      openSong(b.dataset.id);
    });
    $('addBtn').addEventListener('click', () => {
      $('libraryDlg').close();
      $('addInput').value = ''; $('addInput').setCustomValidity('');
      $('addDlg').showModal();
      $('addInput').focus();
    });
    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = videoIdFrom($('addInput').value);
      if (!id) { $('addInput').setCustomValidity('Paste a YouTube link'); $('addInput').reportValidity(); return; }
      $('addDlg').close();
      openSong(id);
    });
    $('addInput').addEventListener('input', (e) => e.target.setCustomValidity(''));
    for (const dlg of [$('libraryDlg'), $('addDlg')]) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); // backdrop or ✕
      });
    }
  }

  // ---------------------------------------------------------------- favourites (per connected user)
  function updateFavBtn() {
    const on = window.Account.isSignedIn() && !!st.id && favourites.has(st.id);
    $('favBtn').setAttribute('aria-pressed', String(on));
    $('favBtn').title = on ? 'Favourite: tap to remove' : 'Favourite';
  }

  async function loadFavourites() {
    favourites = new Set();
    updateFavBtn();
    if (!window.Account.isSignedIn()) return;
    try {
      favourites = new Set((await window.Account.call('listFavourites')).favourites);
    } catch { /* offline or session gone: no favourites shown */ }
    updateFavBtn();
  }

  async function toggleFavourite(btn) {
    if (!window.Account.isSignedIn()) { window.BriefMessage.show('Log in to use the Favourite function', btn); return; }
    if (!st.id) return;
    const id = st.id, on = !favourites.has(id);
    if (on) favourites.add(id); else favourites.delete(id);
    updateFavBtn();
    try {
      await window.Account.call('setFavourite', { songId: id, on });
      window.BriefMessage.show(on ? 'Added to favourites' : 'Removed from favourites', btn);
    } catch (err) {
      if (on) favourites.delete(id); else favourites.add(id);
      updateFavBtn();
      if (err.status !== 401) window.BriefMessage.show(err.message || 'Could not save the favourite', btn);
    }
  }

  // ---------------------------------------------------------------- controls
  function videoIdFrom(text) {
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(text);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(text.trim()) ? text.trim() : null;
  }

  function wire() {
    wireDialogs();
    $('capoDown').addEventListener('click', () => { st.capo = Math.max(0, st.capo - 1); refreshChords(); });
    $('capoUp').addEventListener('click', () => { st.capo = Math.min(11, st.capo + 1); refreshChords(); });
    $('bestBtn').addEventListener('click', () => {
      st.capo = window.Music.bestCapo(st.song ? st.song.chords : [], st.simple).capo; refreshChords();
    });
    $('chordStrip').addEventListener('click', togglePlay);
    $('chordStrip').addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
    });
    $('simpleBtn').addEventListener('click', (e) => {
      st.simple = !st.simple; refreshChords();
      window.BriefMessage.show('Simplify chords ' + (st.simple ? 'ON' : 'OFF'), e.currentTarget);
    });
    const nudgeLyrics = (delta, btn) => {
      st.lyricOffset = Math.round((st.lyricOffset + delta) * 100) / 100;
      st.lineIdx = -2; refreshChords();
      window.BriefMessage.show((st.lyricOffset > 0 ? '+' : '') + st.lyricOffset.toFixed(2) + 's', btn);
    };
    $('offDown').addEventListener('click', (e) => nudgeLyrics(-0.25, e.currentTarget));
    $('offUp').addEventListener('click', (e) => nudgeLyrics(0.25, e.currentTarget));
    $('grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.beat');
      if (!cell || !playerReady) return;
      const i = +cell.dataset.i;
      if (st.loopSetup) { pickLoopBeat(i, cell); return; }
      if (st.loop && (i < st.loop.a || i > st.loop.b)) { // tapping outside the loop ends it
        st.loop = null; updateLoopUi();
        window.BriefMessage.show('Loop off', cell);
      }
      seekTo(st.song.beats[i]);
    });
    $('loopBtn').addEventListener('click', (e) => onLoopButton(e.currentTarget));
    $('favBtn').addEventListener('click', (e) => toggleFavourite(e.currentTarget));
    window.addEventListener(window.Account.EVENT, loadFavourites);
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
    try { st.simple = localStorage.getItem('stomper:simple') !== '0'; } catch { /* default on */ }
    strip = new window.ChordStrip($('chordStrip'));
    wire();
    loadFavourites();
    try { library = (await api({ action: 'list' })).songs; } catch { /* offline with nothing cached */ }
    const fromHash = (location.hash.match(/v=([A-Za-z0-9_-]{11})/) || [])[1];
    const first = fromHash || (library[0] && library[0].id);
    if (first) openSong(first);
    requestAnimationFrame(frame);
  }

  window.PlayerPage = { init };
  // Console/debug helper: StomperDebug()
  window.StomperDebug = () => playerReady && ({
    state: player.getPlayerState(), time: player.getCurrentTime(), duration: player.getDuration(),
    video: player.getVideoData() || {}, songDuration: st.song && st.song.duration, pendingSeek: st.pendingSeek,
  });
})();
