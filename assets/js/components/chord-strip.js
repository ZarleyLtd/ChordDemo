/* Sliding chord strip: previous | CURRENT | next, centred on the current chord.
   One chip per chord change; slides sideways when the chord changes on the beat. */
(function () {
  function ChordStrip(el) {
    this.el = el;
    this.track = document.createElement('div');
    this.track.className = 'track';
    el.appendChild(this.track);
    this.starts = []; // beat index where each chip's chord starts
    this.idx = -2;
    window.addEventListener('resize', () => this.position(false));
  }

  /** shapes: chord shape per beat ('N' = no chord). */
  ChordStrip.prototype.build = function (shapes) {
    const chips = [];
    this.starts = [];
    let last = null;
    shapes.forEach((s, i) => {
      if (s === 'N' || s === last) return;
      last = s;
      this.starts.push(i);
      chips.push(`<div class="chip"><div class="chip-name">${s}</div>${window.chordDiagram(s, 60)}</div>`);
    });
    this.track.innerHTML = chips.join('');
    const keep = this.idx;
    this.idx = -2;
    this.setIndex(keep === -2 ? -1 : keep, false);
  };

  /** Call with the current beat index (-1 before the first beat). */
  ChordStrip.prototype.setBeat = function (beat) {
    const s = this.starts;
    let lo = 0, hi = s.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m] <= beat) { ans = m; lo = m + 1; } else hi = m - 1; }
    this.setIndex(ans, true);
  };

  ChordStrip.prototype.setIndex = function (idx, animate) {
    if (idx === this.idx) return;
    const chips = this.track.children;
    if (chips[this.idx]) chips[this.idx].classList.remove('on');
    this.idx = idx;
    if (chips[idx]) chips[idx].classList.add('on');
    this.position(animate);
  };

  ChordStrip.prototype.position = function (animate) {
    const w = this.el.clientWidth / 3;
    this.el.style.setProperty('--chip-w', w + 'px');
    this.track.style.transition = animate ? '' : 'none';
    this.track.style.transform = `translateX(${(1 - this.idx) * w}px)`;
    if (!animate) void this.track.offsetWidth; // apply without animating, then restore transition
    this.track.style.transition = '';
  };

  window.ChordStrip = ChordStrip;
})();
