/* Chord maths: parse, simplify, capo/transpose, best-capo suggestion, guitar shapes. */
(function () {
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']; // neutral default
  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // major tonics F, Bb, Eb, Ab, Db
  const mod12 = (n) => ((n % 12) + 12) % 12;
  const PC = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
  const MINORISH = new Set(['m', 'm6', 'm7', 'mMaj7', 'm7b5', 'dim', 'dim7']);

  function parse(name) {
    if (!name || name === 'N') return null;
    const m = /^([A-G][#b]?)(.*)$/.exec(name);
    return m ? { root: PC[m[1]], q: m[2] } : null;
  }

  /** keyTonic (major tonic 0-11) picks sharp or flat spelling; omitted = neutral names. */
  function format(root, q, keyTonic) {
    const names = keyTonic == null ? NAMES : FLAT_KEYS.has(mod12(keyTonic)) ? FLATS : SHARPS;
    return names[mod12(root)] + q;
  }

  function simplify(name) {
    const c = parse(name);
    if (!c) return 'N';
    return format(c.root, MINORISH.has(c.q) ? 'm' : '');
  }

  /** Chord shape to play with a capo on fret `capo` (sounding chord moves down). */
  function shapeFor(name, capo, simple, keyTonic) {
    const n = simple ? simplify(name) : name;
    const c = parse(n);
    return c ? format(c.root - capo, c.q, keyTonic == null ? null : keyTonic - capo) : 'N';
  }

  /** Estimate the key from per-beat chords: {tonic (major, 0-11), minor (bool), name}. */
  function keyOf(chords) {
    const DIA = [[0, '', 1.5], [2, 'm', 1], [4, 'm', 0.8], [5, '', 1.2], [7, '', 1.3], [9, 'm', 1], [10, '', 0.4]];
    const score = new Array(12).fill(0);
    const count = {};
    for (const n of chords) {
      const c = parse(simplify(n));
      if (!c) continue;
      count[c.root + c.q] = (count[c.root + c.q] || 0) + 1;
      for (let k = 0; k < 12; k++) {
        for (const [deg, q, w] of DIA) if (mod12(k + deg) === c.root && q === c.q) score[k] += w;
      }
    }
    const tonic = score.indexOf(Math.max(...score));
    const minor = (count[mod12(tonic + 9) + 'm'] || 0) > (count[tonic + ''] || 0);
    const name = minor ? format(tonic + 9, 'm', tonic) : format(tonic, '', tonic);
    return { tonic, minor, name };
  }

  // Open-position shapes, low E -> high e. -1 = muted string.
  const OPEN = {
    C: 'x32010', D: 'xx0232', E: '022100', G: '320003', A: 'x02220',
    Am: 'x02210', Em: '022000', Dm: 'xx0231',
    E7: '020100', A7: 'x02020', D7: 'xx0212', G7: '320001', C7: 'x32310', B7: 'x21202',
    Am7: 'x02010', Em7: '022030', Dm7: 'xx0211',
    Cmaj7: 'x32000', Fmaj7: 'xx3210', Amaj7: 'x02120', Dmaj7: 'xx0222', Gmaj7: '320002',
    Dsus2: 'xx0230', Dsus4: 'xx0233', Asus2: 'x02200', Asus4: 'x02230', Esus4: '022200',
    A6: 'x02222', D6: 'xx0202', E6: '022120', Am6: 'x02212', Em6: '022020',
  };
  // Movable barre templates relative to the barre fret.
  const E_SHAPE = { '': '022100', m: '022000', '7': '020100', m7: '020000', sus4: '022200' };
  const A_SHAPE = {
    '': 'x02220', m: 'x02210', '7': 'x02020', m7: 'x02010', maj7: 'x02120', sus2: 'x02200',
    sus4: 'x02230', '6': 'x02222', m6: 'x02212', dim: 'x0121x', dim7: 'x01212', m7b5: 'x0101x',
    aug: 'x03221', mMaj7: 'x02110',
  };
  const toFrets = (s) => [...s].map((ch) => (ch === 'x' ? -1 : +ch));

  /** Returns {frets:[6 numbers], barre:fret|0} or null. */
  function guitarShape(name) {
    if (OPEN[name]) return { frets: toFrets(OPEN[name]), barre: 0 };
    const c = parse(name);
    if (!c) return null;
    const opts = [];
    if (E_SHAPE[c.q] != null) opts.push({ t: E_SHAPE[c.q], f: (c.root - 4 + 12) % 12 });
    if (A_SHAPE[c.q] != null) opts.push({ t: A_SHAPE[c.q], f: (c.root - 9 + 12) % 12 });
    if (!opts.length) return null;
    opts.sort((a, b) => a.f - b.f);
    const { t, f } = opts[0];
    return { frets: toFrets(t).map((v) => (v < 0 ? -1 : v + f)), barre: f };
  }

  /** Capo 0-7 that needs the fewest beats of non-open (barre) shapes. */
  function bestCapo(chords, simple) {
    let best = { capo: 0, hard: Infinity };
    for (let capo = 0; capo <= 7; capo++) {
      let hard = 0;
      for (const ch of chords) {
        const s = shapeFor(ch, capo, simple);
        if (s !== 'N' && !OPEN[s]) hard++;
      }
      if (hard < best.hard) best = { capo, hard };
    }
    return best;
  }

  window.Music = { parse, simplify, shapeFor, guitarShape, bestCapo, keyOf, format, NAMES };
})();
